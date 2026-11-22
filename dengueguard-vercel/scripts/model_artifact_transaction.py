#!/usr/bin/env python3
"""Best-effort transactional replacement for a related set of artifact files.

All staged files are written before any destination is replaced. If a later
replacement fails, already-replaced destinations are restored from backups.
This protects against ordinary process errors; it is not a filesystem-wide
atomic transaction across multiple paths (a power loss can still interrupt it).
"""
from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path
from typing import Mapping


def _temporary_path(parent: Path, name: str, suffix: str) -> Path:
    descriptor, value = tempfile.mkstemp(prefix=f".{name}.", suffix=suffix, dir=parent)
    os.close(descriptor)
    return Path(value)


def publish_file_bundle(outputs: Mapping[Path, bytes]) -> None:
    """Publish all payloads with rollback if any replacement fails."""
    if not outputs:
        raise ValueError("An artifact bundle must contain at least one file")

    normalized: dict[Path, bytes] = {}
    for raw_path, payload in outputs.items():
        target = Path(raw_path).resolve(strict=False)
        if target in normalized:
            raise ValueError(f"Duplicate artifact destination: {target}")
        if not isinstance(payload, bytes):
            raise TypeError(f"Artifact payload for {target} must be bytes")
        normalized[target] = payload

    staged: dict[Path, Path] = {}
    backups: dict[Path, Path] = {}
    existed: dict[Path, bool] = {}
    replaced: list[Path] = []
    rollback_errors: list[str] = []

    try:
        # Stage and back up every file before changing any destination.
        for target, payload in normalized.items():
            target.parent.mkdir(parents=True, exist_ok=True)
            stage_path = _temporary_path(target.parent, target.name, ".staged")
            staged[target] = stage_path
            with stage_path.open("wb") as handle:
                handle.write(payload)
                handle.flush()
                os.fsync(handle.fileno())

            existed[target] = target.exists()
            if existed[target]:
                backup_path = _temporary_path(target.parent, target.name, ".backup")
                backups[target] = backup_path
                shutil.copy2(target, backup_path)

        # os.replace keeps each individual destination replacement atomic.
        for target in normalized:
            os.replace(staged[target], target)
            replaced.append(target)

    except Exception:
        for target in reversed(replaced):
            try:
                if existed.get(target, False) and target in backups:
                    os.replace(backups[target], target)
                else:
                    target.unlink(missing_ok=True)
            except Exception as rollback_error:  # keep attempting the remaining rollback steps
                rollback_errors.append(f"{target}: {rollback_error}")

        if rollback_errors:
            raise RuntimeError(
                "Artifact bundle publication failed and rollback was incomplete: "
                + "; ".join(rollback_errors)
            )
        raise

    finally:
        for temporary in [*staged.values(), *backups.values()]:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass

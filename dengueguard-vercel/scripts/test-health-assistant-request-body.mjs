import assert from "node:assert/strict";
import { createRequire } from "node:module";
import testRunner from "node:test";

const require = createRequire(import.meta.url);
const {
  MAX_HEALTH_ASSISTANT_REQUEST_BYTES,
  readBoundedJson,
} = require("../.next/health-assistant-request-body-tests/lib/health-assistant/request-body.js");

testRunner("reads a valid small JSON request", async () => {
  const request = new Request("http://localhost/api/health-assistant/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "What is dengue?" }),
  });
  const result = await readBoundedJson(request);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, { query: "What is dengue?" });
});

testRunner("rejects a request whose declared content length exceeds the limit", async () => {
  const request = {
    headers: new Headers({ "content-length": String(MAX_HEALTH_ASSISTANT_REQUEST_BYTES + 1) }),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("{}"));
        controller.close();
      },
    }),
  };
  const result = await readBoundedJson(request);
  assert.equal(result.ok, false);
  assert.equal(result.status, 413);
});

testRunner("rejects an oversized streamed body even when content length is absent", async () => {
  const request = {
    headers: new Headers(),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_HEALTH_ASSISTANT_REQUEST_BYTES + 1));
        controller.close();
      },
    }),
  };
  const result = await readBoundedJson(request);
  assert.equal(result.ok, false);
  assert.equal(result.status, 413);
});

testRunner("rejects malformed JSON and invalid UTF-8", async () => {
  const invalidJson = {
    headers: new Headers(),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("{invalid"));
        controller.close();
      },
    }),
  };
  const invalidResult = await readBoundedJson(invalidJson);
  assert.equal(invalidResult.ok, false);
  assert.equal(invalidResult.status, 400);

  const invalidUtf8 = {
    headers: new Headers(),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([0xc3, 0x28]));
        controller.close();
      },
    }),
  };
  const utf8Result = await readBoundedJson(invalidUtf8);
  assert.equal(utf8Result.ok, false);
  assert.equal(utf8Result.status, 400);
});

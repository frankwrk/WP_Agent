import assert from "node:assert/strict";
import test from "node:test";
import { extractProviderRequestId } from "../../src/services/llm/ai-gateway.client";

test("extractProviderRequestId reads direct id fields", () => {
  const id = extractProviderRequestId({
    request_id: "provider-req-123",
  });

  assert.equal(id, "provider-req-123");
});

test("extractProviderRequestId reads request id from response headers", () => {
  const id = extractProviderRequestId({
    response: {
      headers: new Headers({
        "x-request-id": "hdr-abc-789",
      }),
    },
  });

  assert.equal(id, "hdr-abc-789");
});

test("extractProviderRequestId reads providerMetadata id when present", () => {
  const id = extractProviderRequestId({
    providerMetadata: {
      vercel: {
        requestId: "meta-req-456",
      },
    },
  });

  assert.equal(id, "meta-req-456");
});

import assert from "node:assert/strict";
import test from "node:test";
import { redactValue } from "../src/security.js";
test("redaction removes credential fields and token-shaped strings",()=>{const result=redactValue({apiKey:"secret",nested:{note:"Bearer abcdefghijklmnopqrstuvwxyz",safe:"ok"}}) as any;assert.equal(result.apiKey,"[REDACTED]");assert.equal(result.nested.note,"[REDACTED]");assert.equal(result.nested.safe,"ok");});

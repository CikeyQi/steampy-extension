const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseChinaPrice,
  getLowestAvailablePrice,
  resolveLivePriceResponse,
  getDiscountPercent
} = require("../store/helpers.js");

test("parseChinaPrice parses common Chinese price formats", () => {
  assert.equal(parseChinaPrice("￥12.50"), 12.5);
  assert.equal(parseChinaPrice("1,234.56 元"), 1234.56);
  assert.equal(parseChinaPrice("1.234,56"), 1234.56);
  assert.equal(parseChinaPrice(""), 0);
});

test("getLowestAvailablePrice ignores unavailable and invalid sales", () => {
  assert.equal(
    getLowestAvailablePrice([
      { stock: 0, keyPrice: 1 },
      { stock: 2, keyPrice: 8.5 },
      { stock: 1, keyPrice: 7 },
      { stock: 1, keyPrice: "invalid" }
    ]),
    7
  );
  assert.equal(getLowestAvailablePrice([]), null);
  assert.equal(getLowestAvailablePrice(null), null);
});

test("resolveLivePriceResponse distinguishes live, empty and error responses", () => {
  assert.deepEqual(
    resolveLivePriceResponse({ success: true, result: { content: [{ stock: 1, keyPrice: 9 }] } }),
    { status: "live", price: 9 }
  );
  assert.deepEqual(
    resolveLivePriceResponse({ success: true, result: { content: [] } }),
    { status: "empty", price: null }
  );
  assert.deepEqual(resolveLivePriceResponse({ success: false }), { status: "error", price: null });
});

test("getDiscountPercent returns a rounded positive discount", () => {
  assert.equal(getDiscountPercent(75, 100), 25);
  assert.equal(getDiscountPercent(80, 99), 19);
  assert.equal(getDiscountPercent(0, 100), 0);
});

(function (root, factory) {
  const helpers = factory();
  root.SteamPyHelpers = helpers;
  if (typeof module !== "undefined" && module.exports) module.exports = helpers;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function parseChinaPrice(text) {
    const value = String(text || "").replace(/[^0-9.,-]/g, "");
    if (!value) return 0;

    let normalized = value;
    const lastDot = normalized.lastIndexOf(".");
    const lastComma = normalized.lastIndexOf(",");
    if (lastDot >= 0 && lastComma >= 0) {
      normalized = lastDot > lastComma
        ? normalized.replace(/,/g, "")
        : normalized.replace(/\./g, "").replace(",", ".");
    } else if (lastComma >= 0) {
      const decimals = normalized.length - lastComma - 1;
      normalized = decimals === 1 || decimals === 2
        ? normalized.replace(".", "").replace(",", ".")
        : normalized.replace(/,/g, "");
    }

    const price = Number(normalized);
    return Number.isFinite(price) && price >= 0 ? price : 0;
  }

  function getLowestAvailablePrice(sales) {
    if (!Array.isArray(sales)) return null;
    const prices = sales
      .filter((sale) => Number(sale && sale.stock) > 0)
      .map((sale) => Number(sale && sale.keyPrice))
      .filter((price) => Number.isFinite(price) && price >= 0);
    return prices.length ? Math.min(...prices) : null;
  }

  function resolveLivePriceResponse(response) {
    if (!response || response.success !== true) return { status: "error", price: null };
    const sales = response.result && response.result.content;
    if (!Array.isArray(sales)) return { status: "error", price: null };
    const price = getLowestAvailablePrice(sales);
    return price === null
      ? { status: "empty", price: null }
      : { status: "live", price };
  }

  function getDiscountPercent(price, basePrice) {
    if (!(price > 0) || !(basePrice > 0)) return 0;
    return Math.round((1 - price / basePrice) * 100);
  }

  return { parseChinaPrice, getLowestAvailablePrice, resolveLivePriceResponse, getDiscountPercent };
});

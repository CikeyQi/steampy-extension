(async () => {
    const { parseChinaPrice, resolveLivePriceResponse, getDiscountPercent } = globalThis.SteamPyHelpers;
    const iconUrl = globalThis.chrome?.runtime?.getURL
        ? chrome.runtime.getURL("images/icon128.png")
        : "images/icon128.png";
    const TOKEN_KEY = "steampyAccessToken";
    const MESSAGE_TIMEOUT_MS = 12000;
    const PURCHASE_OPTION_SELECTOR = '.game_area_purchase_game';
    const PRICE_CARD_SELECTOR = '.steampy_prices';

    let accessToken = await getStoredToken();
    let renderGeneration = 0;
    let scanTimer = null;
    let processedOptions = new WeakMap();
    let renderedCards = new WeakMap();
    const gameDataCache = new Map();
    const livePriceCache = new Map();

    function getAppId() {
        try {
            const match = window.location.href.match(/\/app\/(\d+)/);
            if (match) return match[1];

            const hubLink = document.querySelector('.apphub_OtherSiteInfo a');
            if (hubLink) {
                const matchFromLink = hubLink.href.match(/\/app\/(\d+)/);
                if (matchFromLink) return matchFromLink[1];
            }
        } catch (error) {
            console.error("SteamPY app ID error:", error);
        }
        return null;
    }

    function getStoredToken() {
        if (!globalThis.chrome?.storage?.local) {
            try {
                return Promise.resolve(window.localStorage.getItem(TOKEN_KEY) || "");
            } catch (error) {
                return Promise.resolve("");
            }
        }
        return new Promise((resolve) => {
            chrome.storage.local.get([TOKEN_KEY], (data) => resolve(data[TOKEN_KEY] || ""));
        });
    }

    function saveStoredToken(token) {
        if (!globalThis.chrome?.storage?.local) {
            try {
                window.localStorage.setItem(TOKEN_KEY, token);
                return Promise.resolve();
            } catch (error) {
                return Promise.reject(error);
            }
        }
        return new Promise((resolve, reject) => {
            chrome.storage.local.set({ [TOKEN_KEY]: token }, () => {
                if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
                else resolve();
            });
        });
    }

    function removeStoredToken() {
        if (!globalThis.chrome?.storage?.local) {
            try {
                window.localStorage.removeItem(TOKEN_KEY);
                return Promise.resolve();
            } catch (error) {
                return Promise.reject(error);
            }
        }
        return new Promise((resolve, reject) => {
            chrome.storage.local.remove(TOKEN_KEY, () => {
                if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
                else resolve();
            });
        });
    }

    function isSteamClientEnvironment() {
        return /Valve Steam Client/i.test(navigator.userAgent) || Boolean(globalThis.SteamClient);
    }

    function showTokenNotice(message, isError = false) {
        const notice = document.createElement("div");
        notice.className = `steampy_token_notice${isError ? " steampy_token_notice_error" : ""}`;
        notice.textContent = message;
        notice.setAttribute("role", "status");
        document.body?.appendChild(notice);
        window.setTimeout(() => notice.remove(), 3500);
    }

    function refreshPricesAfterTokenChange() {
        renderGeneration += 1;
        gameDataCache.clear();
        livePriceCache.clear();
        processedOptions = new WeakMap();
        renderedCards = new WeakMap();
        document.querySelectorAll(PRICE_CARD_SELECTOR).forEach((box) => box.remove());
        scanPurchaseOptions(renderGeneration);
    }

    function openTokenDialog() {
        const existingDialog = document.querySelector(".steampy_token_dialog");
        if (existingDialog) return;

        const overlay = document.createElement("div");
        overlay.className = "steampy_token_dialog";
        overlay.setAttribute("role", "presentation");

        const dialog = document.createElement("div");
        dialog.className = "steampy_token_dialog_content";
        dialog.setAttribute("role", "dialog");
        dialog.setAttribute("aria-modal", "true");
        dialog.setAttribute("aria-labelledby", "steampy-token-dialog-title");

        const title = document.createElement("h2");
        title.id = "steampy-token-dialog-title";
        title.textContent = "配置 SteamPY accessToken";

        const description = document.createElement("p");
        description.textContent = "请输入 accessToken，用于查询实时 CDK 最低价。";

        const input = document.createElement("input");
        input.type = "text";
        input.className = "steampy_token_input";
        input.value = accessToken;
        input.placeholder = "请输入 accessToken";
        input.autocomplete = "off";
        input.spellcheck = false;
        input.setAttribute("aria-label", "SteamPY accessToken");

        const actions = document.createElement("div");
        actions.className = "steampy_token_dialog_actions";

        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.className = "steampy_token_button steampy_token_button_secondary";
        cancelButton.textContent = "取消";

        const clearButton = document.createElement("button");
        clearButton.type = "button";
        clearButton.className = "steampy_token_button steampy_token_button_danger";
        clearButton.textContent = "清除 Token";

        const saveButton = document.createElement("button");
        saveButton.type = "button";
        saveButton.className = "steampy_token_button steampy_token_button_primary";
        saveButton.textContent = "保存";

        const closeDialog = () => overlay.remove();
        const saveToken = async (token, message) => {
            saveButton.disabled = true;
            clearButton.disabled = true;
            try {
                if (token) await saveStoredToken(token);
                else await removeStoredToken();
                accessToken = token;
                closeDialog();
                refreshPricesAfterTokenChange();
                showTokenNotice(message);
            } catch (error) {
                console.error("SteamPY token error:", error);
                showTokenNotice("Token 保存失败，请稍后重试。", true);
                saveButton.disabled = false;
                clearButton.disabled = false;
            }
        };

        cancelButton.addEventListener("click", closeDialog);
        clearButton.addEventListener("click", () => saveToken("", "accessToken 已清除，正在刷新价格。"));
        saveButton.addEventListener("click", () => {
            const token = input.value.trim();
            if (!token) {
                showTokenNotice("请输入 accessToken，或点击“清除 Token”。", true);
                input.focus();
                return;
            }
            saveToken(token, "accessToken 已保存，正在刷新实时价格。");
        });
        overlay.addEventListener("click", (event) => {
            if (event.target === overlay) closeDialog();
        });
        dialog.addEventListener("keydown", (event) => {
            if (event.key === "Escape") closeDialog();
            if (event.key === "Enter" && event.target === input) saveButton.click();
        });

        actions.append(cancelButton, clearButton, saveButton);
        dialog.append(title, description, input, actions);
        overlay.appendChild(dialog);
        document.body?.appendChild(overlay);
        input.focus();
    }

    function sendFetch(url, token) {
        if (!globalThis.chrome?.runtime?.sendMessage) {
            return Promise.resolve({ success: false, error: "Extension messaging is unavailable" });
        }
        return new Promise((resolve) => {
            let settled = false;
            const timer = setTimeout(() => {
                if (!settled) {
                    settled = true;
                    resolve({ success: false, error: 'Request timed out' });
                }
            }, MESSAGE_TIMEOUT_MS);

            chrome.runtime.sendMessage({ type: 'fetch', url, accessToken: token }, (response) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (chrome.runtime.lastError) {
                    resolve({ success: false, error: chrome.runtime.lastError.message });
                } else {
                    resolve(response || { success: false, error: 'Empty response' });
                }
            });
        });
    }

    function fetchGameData(appId, subId, type, token) {
        const cacheKey = `${appId}:${type}:${subId}:${token}`;
        if (!gameDataCache.has(cacheKey)) {
            const url = `https://steampy.com/xboot/common/plugIn/getGame?subId=${encodeURIComponent(subId)}&appId=${encodeURIComponent(appId)}&type=${encodeURIComponent(type)}`;
            gameDataCache.set(cacheKey, sendFetch(url, token));
        }
        return gameDataCache.get(cacheKey);
    }

    function fetchLiveCdkPrice(gameId, token) {
        if (!token || !gameId) return Promise.resolve(null);
        const cacheKey = `${gameId}:${token}`;
        if (!livePriceCache.has(cacheKey)) {
            const query = new URLSearchParams({
                pageNumber: "1",
                pageSize: "20",
                sort: "keyPrice",
                order: "asc",
                startDate: "",
                endDate: "",
                gameId: String(gameId),
                _: String(Date.now())
            });
            const request = sendFetch(`https://steampy.com/xboot/steamKeySale/listSale?${query}`, token)
                .then((response) => {
                    return resolveLivePriceResponse(response);
                });
            livePriceCache.set(cacheKey, request);
        }
        return livePriceCache.get(cacheKey);
    }

    function getSteamPrice(element) {
        try {
            const original = element.querySelector('.discount_original_price');
            const normal = element.querySelector('.game_purchase_price');
            return parseChinaPrice((original || normal || {}).textContent);
        } catch (error) {
            return 0;
        }
    }

    function getPurchaseInfo(option) {
        const form = option.querySelector('form');
        if (!form) return null;
        const inputs = form.querySelectorAll('input[name="subid"], input[name="bundleid"]');
        if (!inputs.length) return null;
        const input = inputs[inputs.length - 1];
        if (!input.value) return null;
        return { subId: input.value, type: input.name };
    }

    function getPurchaseSignature(option) {
        const info = getPurchaseInfo(option);
        return info ? `${info.type}:${info.subId}` : 'empty';
    }

    function openUrl(url) {
        if (isSteamClientEnvironment()) {
            window.location.href = `steam://openurl_external/${encodeURI(url)}`;
            return;
        }

        if (globalThis.chrome?.runtime?.sendMessage) {
            chrome.runtime.sendMessage({ type: "open_url", url });
            return;
        }

        window.open(url, "_blank", "noopener,noreferrer");
    }

    function createPriceLine(label, price, steamPrice, url, isStale) {
        const line = document.createElement('div');
        line.className = 'steampy_prices_top';

        line.appendChild(document.createTextNode(label));

        const priceWithInfo = document.createElement('span');
        priceWithInfo.className = 'steampy_price_with_info';

        const priceLink = document.createElement('button');
        priceLink.type = 'button';
        priceLink.className = 'steampy_price_link';
        priceLink.textContent = `￥ ${Number(price).toFixed(2)}`;
        priceLink.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            openUrl(url);
        });
        priceWithInfo.appendChild(priceLink);

        if (isStale) {
            const info = document.createElement('sup');
            info.className = 'steampy_stale_info';
            info.textContent = '?';
            info.title = '点击控件左侧图标配置 accessToken 后可查询实时价格。';
            info.setAttribute('aria-label', info.title);
            priceWithInfo.appendChild(info);
        }
        line.appendChild(priceWithInfo);

        const discount = getDiscountPercent(price, steamPrice);
        if (discount > 0) {
            const discountLabel = document.createElement('span');
            discountLabel.textContent = `，折扣为 `;
            line.appendChild(discountLabel);

            const discountValue = document.createElement('span');
            discountValue.className = 'steampy_discount_value';
            discountValue.textContent = `-${discount}%`;
            line.appendChild(discountValue);
        }
        return line;
    }

    function renderPriceBox(option, data, steamPrice, staleKeyPrice) {
        const contentWrap = document.createElement('div');
        contentWrap.className = 'steampy_prices_text';
        if (Number(data.daiPrice) > 0) {
            contentWrap.appendChild(createPriceLine(
                'SteamPY 代购价格为 ',
                data.daiPrice,
                steamPrice,
                `https://steampy.com/hotGameDetail?gameId=${encodeURIComponent(String(data.id))}`,
                false
            ));
        }
        if (Number(data.keyPrice) > 0) {
            contentWrap.appendChild(createPriceLine(
                'SteamPY CDK 价格为 ',
                data.keyPrice,
                steamPrice,
                `https://steampy.com/cdkDetail?name=cn&gameId=${encodeURIComponent(String(data.id))}`,
                staleKeyPrice
            ));
        }
        if (!contentWrap.childElementCount) return;

        const box = document.createElement('div');
        box.className = 'steampy_prices';

        const previousBox = renderedCards.get(option);
        if (previousBox) previousBox.remove();
        renderedCards.set(option, box);

        const img = document.createElement('img');
        img.className = 'steampy_prices_icon';
        img.src = iconUrl;
        img.alt = '设置 SteamPY accessToken';
        img.title = '点击设置 SteamPY accessToken';
        img.setAttribute('role', 'button');
        img.setAttribute('aria-label', img.alt);
        img.tabIndex = 0;
        img.addEventListener("click", openTokenDialog);
        img.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openTokenDialog();
            }
        });
        box.append(img, contentWrap);

        const wrapper = option.closest('.game_area_purchase_game_wrapper');
        if (wrapper) wrapper.appendChild(box);
        else if (option.parentElement) option.parentElement.insertBefore(box, option.nextSibling);
    }

    async function processPurchaseOption(option, generation) {
        const signature = getPurchaseSignature(option);
        const previous = processedOptions.get(option);
        if (previous && previous.generation === generation && previous.signature === signature) return;
        processedOptions.set(option, { generation, signature });

        const info = getPurchaseInfo(option);
        if (!info) return;

        try {
            const response = await fetchGameData(appId, info.subId, info.type, accessToken);
            if (
                generation !== renderGeneration
                || getPurchaseSignature(option) !== signature
                || !response
                || !response.success
                || !response.result
            ) return;

            const steamPrice = getSteamPrice(option);
            const data = { ...response.result };
            let staleKeyPrice = !accessToken;
            if (accessToken) {
                const liveResult = await fetchLiveCdkPrice(data.id, accessToken);
                if (generation !== renderGeneration || getPurchaseSignature(option) !== signature) return;
                if (liveResult && liveResult.status === 'live') {
                    data.keyPrice = liveResult.price;
                    staleKeyPrice = false;
                } else if (liveResult && liveResult.status === 'empty') {
                    data.keyPrice = null;
                    staleKeyPrice = false;
                } else {
                    staleKeyPrice = true;
                }
            }
            renderPriceBox(option, data, steamPrice, staleKeyPrice);
        } catch (error) {
            console.error("SteamPY error:", error);
        }
    }

    function scanPurchaseOptions(generation) {
        document.querySelectorAll(PURCHASE_OPTION_SELECTOR).forEach((option) => {
            processPurchaseOption(option, generation);
        });
    }

    const appId = getAppId();
    if (!appId) return;

    scanPurchaseOptions(renderGeneration);

    const observer = new MutationObserver(() => {
        clearTimeout(scanTimer);
        scanTimer = setTimeout(() => scanPurchaseOptions(renderGeneration), 150);
    });
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
})();

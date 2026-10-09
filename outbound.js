// ==UserScript==
// @name         Outbound Helper
// @namespace    http://tampermonkey.net/
// @version      1.7
// @description  Outbound Helper
// @author       desslow
// @match        https://*.ozon.ru/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let allContainersSealed = true;
    let lastSpokenCode = '';
    let isPlayingAudio = false;
    let isTransferringInProgress = false;
    let hasAlertedSealedError = false;
    window._ozonAuthHeaders = null;

    const SOUND_ERROR = 'https://st.ozone.ru/s3/turbo-pvz-ui-bucket/mp3/error.mp3';
    const audioError = new Audio(SOUND_ERROR);
    audioError.preload = 'auto';

    function isOutboundPage() {
        return window.location.pathname.startsWith('/outbound');
    }

    function isCarriageDetailsPage() {
        if (!isOutboundPage()) return false;
        const params = new URLSearchParams(window.location.search);
        return params.get('type') === 'carriage';
    }

    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    const origSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

    XMLHttpRequest.prototype.open = function(method, url) {
        this._reqUrl = typeof url === 'string' ? url : '';
        this._reqHeaders = {};
        return origOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
        if (this._reqHeaders) this._reqHeaders[name.toLowerCase()] = value;
        return origSetRequestHeader.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function() {
        if (this._reqHeaders && this._reqHeaders['authorization']) {
            window._ozonAuthHeaders = {
                'authorization': this._reqHeaders['authorization'],
                'x-o3-app-name': this._reqHeaders['x-o3-app-name'] || 'turbo-pvz-ui',
                'x-o3-app-version': this._reqHeaders['x-o3-app-version'] || '',
                'x-o3-version-name': this._reqHeaders['x-o3-version-name'] || ''
            };
        }

        this.addEventListener('load', function() {
            try {
                if (this._reqUrl.includes('/readiness-state')) {
                    const data = JSON.parse(this.responseText);
                    if (typeof data.allContainersSealed === 'boolean') {
                        allContainersSealed = data.allContainersSealed;
                        if (isOutboundPage()) handleCourierCodeSecurity();
                    }
                }
            } catch (e) {}
        });

        return origSend.apply(this, arguments);
    };

    const origFetch = window.fetch;
    window.fetch = async function(...args) {
        try {
            const config = args[1];
            const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');

            if (config && config.headers) {
                let h = new Headers(config.headers);
                if (h.has('authorization')) {
                    window._ozonAuthHeaders = {
                        'authorization': h.get('authorization'),
                        'x-o3-app-name': h.get('x-o3-app-name') || 'turbo-pvz-ui',
                        'x-o3-app-version': h.get('x-o3-app-version') || '',
                        'x-o3-version-name': h.get('x-o3-version-name') || ''
                    };
                }
            }

            const response = await origFetch.apply(this, args);

            if (url.includes('/readiness-state')) {
                response.clone().json().then(data => {
                    if (typeof data.allContainersSealed === 'boolean') {
                        allContainersSealed = data.allContainersSealed;
                        if (isOutboundPage()) handleCourierCodeSecurity();
                    }
                }).catch(() => {});
            }

            return response;
        } catch (e) {
            return origFetch.apply(this, args);
        }
    };

    const style = document.createElement('style');
    style.innerHTML = `
        .smart-blur-courier {
            filter: blur(16px) !important;
            user-select: none !important;
            pointer-events: none !important;
            transition: filter 0.2s ease !important;
        }

        [class*="_titleWrap_"] {
            font-size: 14px !important;
            font-weight: 700 !important;
            color: #111827 !important;
            line-height: 1.3 !important;
        }

        [class*="_flex_lxoww_"],
        [class*="_colorHex_lxoww_"],
        [class*="_label_lxoww_"],
        [class*="_label_b37w4_"],
        [class*="_label_b37w4_"] + span {
            display: none !important;
        }

        #outbound-tare-controls {
            display: inline-flex !important;
            align-items: center !important;
            gap: 8px !important;
            margin-left: 12px !important;
            vertical-align: middle !important;
            height: 40px !important;
            box-sizing: border-box !important;
        }

        #outbound-tare-input {
            width: 52px !important;
            height: 40px !important;
            min-height: 40px !important;
            padding: 0 4px !important;
            border: 1px solid #d6dbe0 !important;
            border-radius: 8px !important;
            font-size: 14px !important;
            font-weight: 600 !important;
            text-align: center !important;
            outline: none !important;
            box-sizing: border-box !important;
            background: #ffffff !important;
            color: #111827 !important;
            font-family: inherit !important;
            transition: border-color 0.15s, box-shadow 0.15s !important;
        }
        #outbound-tare-input:focus {
            border-color: #005bff !important;
            box-shadow: 0 0 0 2px rgba(0, 91, 255, 0.15) !important;
        }

        #outbound-tare-btn {
            background: #005bff !important;
            color: #ffffff !important;
            border: none !important;
            border-radius: 8px !important;
            height: 40px !important;
            min-height: 40px !important;
            padding: 0 16px !important;
            font-size: 14px !important;
            font-weight: 600 !important;
            cursor: pointer !important;
            white-space: nowrap !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            box-sizing: border-box !important;
            font-family: inherit !important;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05) !important;
            transition: background 0.15s, transform 0.1s !important;
        }
        #outbound-tare-btn:hover {
            background: #004ecc !important;
        }
        #outbound-tare-btn:active {
            transform: scale(0.98) !important;
        }
        #outbound-tare-btn:disabled {
            background: #e2e8f0 !important;
            color: #94a3b8 !important;
            cursor: not-allowed !important;
            transform: none !important;
        }
    `;
    document.head.appendChild(style);

    function playAudioSequence(part1, part2) {
        if (isPlayingAudio) return;
        isPlayingAudio = true;

        const playWav = (num) => new Promise(resolve => {
            const a = new Audio(`https://st.ozone.ru/s3/pvz-api-tts/${num}_male_100.wav`);
            a.onended = resolve;
            a.onerror = resolve;
            a.play().catch(resolve);
        });

        playWav(part1)
            .then(() => new Promise(r => setTimeout(r, 120)))
            .then(() => playWav(part2))
            .finally(() => {
                isPlayingAudio = false;
            });
    }

    function showSealedErrorToast() {
        let t = document.getElementById('outbound-sealed-toast');
        if (t) t.remove();

        t = document.createElement('div');
        t.id = 'outbound-sealed-toast';
        t.style.cssText = `
            position: fixed !important;
            top: 24px !important;
            right: 24px !important;
            background: #ef4444 !important;
            color: #ffffff !important;
            padding: 12px 18px !important;
            border-radius: 10px !important;
            font-size: 13px !important;
            font-weight: 700 !important;
            box-shadow: 0 8px 24px rgba(239, 68, 68, 0.4) !important;
            z-index: 9999999 !important;
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
        `;
        t.innerHTML = `<span>⚠️</span><span>Необходимо запечатать все контейнеры!</span>`;
        document.body.appendChild(t);

        try {
            audioError.currentTime = 0;
            audioError.play().catch(() => {});
        } catch (e) {}

        setTimeout(() => { if (t) t.remove(); }, 6000);
    }

    function findCourierCodeElement() {
        if (!window.location.pathname.startsWith('/outbound')) return null;

        const exactEl = document.querySelector('[class*="_courierCode_"]');
        if (exactEl) return exactEl;

        const dialog = document.querySelector('[class*="dialog__dialog"], [class*="_dialogWindow_"], [class*="window__window"]');
        if (dialog && dialog.textContent.includes('курьер')) {
            const candidates = Array.from(dialog.querySelectorAll('div, span, p'));
            for (let el of candidates) {
                if (el.children.length === 0 && /^\d{4}$/.test(el.textContent.trim())) {
                    return el;
                }
            }
        }

        return null;
    }

    function handleCourierCodeSecurity() {
        if (!window.location.pathname.startsWith('/outbound')) return;

        const codeEl = findCourierCodeElement();
        if (!codeEl) {
            hasAlertedSealedError = false;
            lastSpokenCode = '';
            return;
        }

        if (!allContainersSealed) {
            codeEl.classList.add('smart-blur-courier');
            if (!hasAlertedSealedError) {
                hasAlertedSealedError = true;
                showSealedErrorToast();
            }
        } else {
            hasAlertedSealedError = false;
            codeEl.classList.remove('smart-blur-courier');
            const code = codeEl.textContent.trim();
            if (code.length === 4 && code !== lastSpokenCode) {
                lastSpokenCode = code;
                const part1 = code.slice(0, 2);
                const part2 = code.slice(2, 4);
                playAudioSequence(part1, part2);
            }
        }
    }


    function getRightColumnSplitX() {
        const content = document.querySelector('._content_jbnnr_28') || document.querySelector('main') || document.body;
        const r = content.getBoundingClientRect();
        return r.left + (r.width * 0.45);
    }

    function getEmptyTareElements() {
        const splitX = getRightColumnSplitX();
        const allDraggables = Array.from(document.querySelectorAll('[draggable="true"]'));

        const uniqueTares = [];
        const seenIds = new Set();

        for (const el of allDraggables) {
            const rect = el.getBoundingClientRect();
            if (rect.left < splitX || rect.width === 0 || rect.height === 0) continue;

            const text = el.textContent || '';
            const isKty = text.includes('КТЯ') || text.includes('Тарный ящик') || text.includes('%301%');
            const checkbox = el.querySelector('input[type="checkbox"]');

            if (isKty && checkbox) {
                const match = text.match(/%301%\d+/) || text.match(/\d{12,16}/);
                const uniqueKey = match ? match[0] : el;

                if (!seenIds.has(uniqueKey)) {
                    seenIds.add(uniqueKey);
                    uniqueTares.push(el);
                }
            }
        }

        return uniqueTares;
    }

    function findOzonNativeMoveButton() {
        const actionContainer = document.querySelector('[class*="_actions_"]');
        if (actionContainer) {
            const btn = actionContainer.querySelector('button');
            if (btn && btn.textContent.trim().startsWith('Переместить')) return btn;
        }

        const allButtons = Array.from(document.querySelectorAll('button:not([id*="outbound"])'));
        return allButtons.find(b => b.textContent.trim() === 'Переместить');
    }

    function injectTareTransferControls() {
        if (!isCarriageDetailsPage()) {
            const existing = document.getElementById('outbound-tare-controls');
            if (existing) existing.remove();
            return;
        }

        const controlsContainer = document.querySelector('[class*="_topControls_"]');
        if (!controlsContainer) return;

        let myControls = document.getElementById('outbound-tare-controls');
        const emptyTares = getEmptyTareElements();
        const liveTotal = emptyTares.length;

        if (!myControls) {
            myControls = document.createElement('div');
            myControls.id = 'outbound-tare-controls';
            myControls.innerHTML = `
                <input type="number" id="outbound-tare-input" min="1" max="${liveTotal}" value="${liveTotal}">
                <button type="button" id="outbound-tare-btn">Переместить КТЯ (${liveTotal})</button>
            `;
            controlsContainer.appendChild(myControls);

            const inputEl = document.getElementById('outbound-tare-input');
            const btnEl = document.getElementById('outbound-tare-btn');

            btnEl.onclick = async () => {
                if (isTransferringInProgress) return;
                isTransferringInProgress = true;

                const freshTares = getEmptyTareElements();
                const freshTotal = freshTares.length;
                const requestedCount = parseInt(inputEl.value, 10) || 0;
                const countToMove = Math.min(requestedCount, freshTotal);

                if (countToMove <= 0) {
                    isTransferringInProgress = false;
                    return;
                }

                btnEl.disabled = true;
                btnEl.textContent = 'Отмечаем...';

                const targetTares = freshTares.slice(0, countToMove);

                for (let i = 0; i < targetTares.length; i++) {
                    const tareEl = targetTares[i];
                    const label = tareEl.querySelector('label') || tareEl.querySelector('input[type="checkbox"]');
                    const input = tareEl.querySelector('input[type="checkbox"]');

                    const isChecked = (input && input.checked) || (label && label.className.includes('checked'));
                    if (!isChecked && label) {
                        label.click();
                        await new Promise(r => setTimeout(r, 50));
                    }
                }

                btnEl.textContent = 'Ждем кнопку...';

                let attempts = 0;
                const checkMoveInterval = setInterval(() => {
                    attempts++;
                    const moveBtn = findOzonNativeMoveButton();

                    if (moveBtn) {
                        clearInterval(checkMoveInterval);
                        moveBtn.click();
                        btnEl.textContent = 'Готово!';
                        setTimeout(() => {
                            btnEl.disabled = false;
                            isTransferringInProgress = false;
                            btnEl.textContent = `Переместить КТЯ (${getEmptyTareElements().length})`;
                        }, 1500);
                    } else if (attempts > 25) {
                        clearInterval(checkMoveInterval);
                        btnEl.disabled = false;
                        isTransferringInProgress = false;
                        btnEl.textContent = `Переместить КТЯ (${freshTotal})`;
                    }
                }, 100);
            };
        } else {
            const inputEl = document.getElementById('outbound-tare-input');
            const btnEl = document.getElementById('outbound-tare-btn');
            if (inputEl && btnEl && !btnEl.disabled && !isTransferringInProgress) {
                inputEl.max = liveTotal;
                if (!inputEl.dataset.userEdited || parseInt(inputEl.value, 10) > liveTotal) {
                    inputEl.value = liveTotal;
                }
                btnEl.textContent = `Переместить КТЯ (${liveTotal})`;
            }
        }
    }

    document.addEventListener('input', (e) => {
        if (e.target.id === 'outbound-tare-input') {
            e.target.dataset.userEdited = 'true';
        }
    });

    setInterval(() => {
        if (!isOutboundPage()) return;
        handleCourierCodeSecurity();
        injectTareTransferControls();
    }, 400);

})();

/*
 * tlib.js
 *
 * Universal JavaScript library for Tampermonkey scripts.
 *
 * Library: tlib
 * Version: 1.0.0
 *
 * Classes:
 *
 *   tlib.Util
 *       sleep(ms)
 *           Waits asynchronously for the specified milliseconds.
 *           Returns: Promise<void>
 *
 *       log(text1, text2, text3, text4, text5)
 *           Logs text to console and appends it to the document.
 *           Returns: void
 *
 *   tlib.CrossTabBridge
 *
 * CrossTabBridge methods:
 *
 *   open(url, data, options)
 *       Opens a new tab, sends data and waits for ACK.
 *
 *   send(targetWindow, data, targetOrigin, options)
 *       Sends data to an existing tab and waits for ACK.
 *
 *   receive(callback, options)
 *       Registers a receiver and automatically acknowledges
 *       messages after successful processing.
 *
 * Example:
 *
 *   await tlib.Util.sleep(1000);
 *   tlib.Util.log("Hello World");
 *
 *   const result = await tlib.CrossTabBridge.open(
 *       "https://example.com/",
 *       "Hello!"
 *   );
 *
 *   await tlib.CrossTabBridge.send(
 *       result.window,
 *       "Another message",
 *       "https://example.com"
 *   );
 *
 *   tlib.CrossTabBridge.receive(async (data) => {
 *       console.log(data);
 *   });
 */

(function (root) {

    'use strict';

    // ============================================================
    // tlib namespace
    // ============================================================

    const tlib = root.tlib || {};

    // ============================================================
    // Util
    // ============================================================

    /**
     * Utility functions for delays and on-page logging.
     *
     * sleep(ms): Waits for the specified time; returns a Promise.
     * log(text1, text2, text3, text4, text5): Logs to console
     * and appends the combined text to the document; returns nothing.
     */
    class Util {

        /**
         * Waits for the specified number of milliseconds.
         * @param {number} ms - Delay in milliseconds.
         * @returns {Promise<void>} Resolves after the delay.
         */
        static sleep(ms) {
            console.debug("[tlib.Util] sleep:", ms, "ms");
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        /**
         * Writes a message to the console and appends it to the page.
         * @param {*} text1 - First text part.
         * @param {*} text2 - Optional second text part.
         * @param {*} text3 - Optional third text part.
         * @param {*} text4 - Optional fourth text part.
         * @param {*} text5 - Optional fifth text part.
         * @returns {void}
         */
        static log(text1, text2 = "", text3 = "", text4 = "", text5 = "") {

            const text = text1 + text2 + text3 + text4 + text5;

            console.log("Log: " + text);
            console.debug("[tlib.Util] Appending log message to document.");

            const txt = document.createElement("pre");
            txt.style.fontSize = "12px";
            txt.textContent = text;
            txt.style.whiteSpace = "pre-wrap";
            txt.style.marginTop = "2px";
            txt.style.color = text1.includes("[ERROR]") ? "#990000" : "#000000";

            document.body.appendChild(txt);
        }
    }

    // ============================================================
    // CrossTabBridge
    // ============================================================

    class CrossTabBridge {

        static VERSION = "1.0.0";

        static DEFAULT_TIMEOUT = 15000;

        /**
         * Opens a new tab, waits for the receiver to become ready,
         * sends data and waits for acknowledgement.
         *
         * @param {string} url
         *        Target URL.
         *
         * @param {*} data
         *        Data to transfer.
         *
         * @param {object} options
         *        Optional configuration.
         *
         * Options:
         *   timeout: Maximum wait time in milliseconds.
         *
         * Returns:
         *   { window: Window } on success.
         *   null on failure.
         *
         * Example:
         *
         *   const result = await tlib.CrossTabBridge.open(
         *       "https://example.com/",
         *       "Hello!"
         *   );
         */
        static async open(url, data, options = {}) {

            const timeout = options.timeout ?? this.DEFAULT_TIMEOUT;

            let targetOrigin;

            try {
                targetOrigin = new URL(url).origin;
            } catch (error) {
                console.error("[tlib.CrossTabBridge] Invalid URL:", error);
                return null;
            }

            const messageId = crypto.randomUUID();

            let targetWindow = null;
            let timer = null;
            let sent = false;

            return new Promise((resolve) => {

                const cleanup = () => {
                    window.removeEventListener("message", listener);
                    clearTimeout(timer);
                };

                const fail = (error) => {
                    cleanup();
                    console.error("[tlib.CrossTabBridge]", error);
                    resolve(null);
                };

                const listener = (event) => {

                    if (event.origin !== targetOrigin) return;
                    if (event.source !== targetWindow) return;

                    // Receiver is ready
                    if (
                        event.data?.type === "TLIB_BRIDGE_READY" &&
                        !sent
                    ) {

                        sent = true;

                        targetWindow.postMessage({
                            type: "TLIB_BRIDGE_DATA",
                            id: messageId,
                            value: data
                        }, targetOrigin);

                        return;
                    }

                    // Message acknowledged
                    if (
                        event.data?.type === "TLIB_BRIDGE_ACK" &&
                        event.data.id === messageId
                    ) {

                        cleanup();

                        if (event.data.ok) {
                            console.log(
                                "[tlib.CrossTabBridge] Message acknowledged."
                            );

                            resolve({
                                window: targetWindow
                            });

                        } else {

                            console.error(
                                "[tlib.CrossTabBridge] Receiver error:",
                                event.data.error
                            );

                            resolve(null);
                        }
                    }
                };

                // Register listener BEFORE opening the tab.
                window.addEventListener("message", listener);

                timer = setTimeout(() => {
                    fail("Timeout waiting for receiver or acknowledgement.");
                }, timeout);

                // Open new tab
                targetWindow = window.open(url, "_blank");

                if (!targetWindow) {
                    fail("Could not open tab. Popup blocked?");
                }

            });
        }

        /**
         * Sends data to an already open tab.
         *
         * The target tab must have been opened by this window
         * or otherwise be accessible through a valid Window reference.
         *
         * The receiver must already be initialized.
         *
         * @param {Window} targetWindow
         *        Reference to the target tab.
         *
         * @param {*} data
         *        Data to transfer.
         *
         * @param {string} targetOrigin
         *        Expected origin of the target tab.
         *
         * @param {object} options
         *        Optional configuration.
         *
         * Options:
         *   timeout: Maximum wait time in milliseconds.
         *
         * Returns:
         *   true on success.
         *   false on failure.
         *
         * Example:
         *
         *   await tlib.CrossTabBridge.send(
         *       tab,
         *       "Hello again!",
         *       "https://example.com"
         *   );
         */
        static async send(
            targetWindow,
            data,
            targetOrigin,
            options = {}
        ) {

            const timeout = options.timeout ?? this.DEFAULT_TIMEOUT;

            if (!targetWindow || targetWindow.closed) {
                console.error(
                    "[tlib.CrossTabBridge] Target tab is unavailable."
                );
                return false;
            }

            let origin;

            try {
                origin = new URL(targetOrigin).origin;
            } catch (error) {
                console.error(
                    "[tlib.CrossTabBridge] Invalid target origin:",
                    error
                );
                return false;
            }

            const messageId = crypto.randomUUID();

            return new Promise((resolve) => {

                let timer;

                const cleanup = () => {
                    window.removeEventListener("message", listener);
                    clearTimeout(timer);
                };

                const fail = (error) => {
                    cleanup();
                    console.error("[tlib.CrossTabBridge]", error);
                    resolve(false);
                };

                const listener = (event) => {

                    if (event.origin !== origin) return;
                    if (event.source !== targetWindow) return;

                    if (
                        event.data?.type !== "TLIB_BRIDGE_ACK" ||
                        event.data.id !== messageId
                    ) return;

                    cleanup();

                    if (event.data.ok) {

                        console.log(
                            "[tlib.CrossTabBridge] Message acknowledged."
                        );

                        resolve(true);

                    } else {

                        console.error(
                            "[tlib.CrossTabBridge] Receiver error:",
                            event.data.error
                        );

                        resolve(false);
                    }
                };

                window.addEventListener("message", listener);

                timer = setTimeout(() => {
                    fail("Timeout waiting for acknowledgement.");
                }, timeout);

                try {

                    targetWindow.postMessage({
                        type: "TLIB_BRIDGE_DATA",
                        id: messageId,
                        value: data
                    }, origin);

                } catch (error) {
                    fail(error);
                }

            });
        }

        /**
         * Registers a message receiver.
         *
         * Incoming messages are processed by the callback.
         * Acknowledgement is sent automatically after the callback
         * completes successfully.
         *
         * If the callback throws an exception, a negative ACK
         * is sent instead.
         *
         * @param {Function} callback
         *        Function called for every incoming message.
         *
         * @param {object} options
         *        Optional configuration.
         *
         * Options:
         *   allowedOrigins: Array of permitted sender origins.
         *                   Default: ["https://www.youtube.com"]
         *
         * Returns:
         *   A function that unregisters the receiver.
         *
         * Example:
         *
         *   tlib.CrossTabBridge.receive(async (data) => {
         *       console.log("Received:", data);
         *   });
         */
        static receive(callback, options = {}) {

            const allowedOrigins = options.allowedOrigins ??
                ["https://www.youtube.com"];

            if (typeof callback !== "function") {
                console.error(
                    "[tlib.CrossTabBridge] Callback must be a function."
                );
                return () => {};
            }

            if (!Array.isArray(allowedOrigins) ||
                allowedOrigins.length === 0) {

                console.error(
                    "[tlib.CrossTabBridge] allowedOrigins must be a non-empty array."
                );

                return () => {};
            }

            const listener = async (event) => {

                // Check sender origin
                if (!allowedOrigins.includes(event.origin)) return;

                // Only accept messages from the opener
                if (event.source !== window.opener) return;

                if (event.data?.type !== "TLIB_BRIDGE_DATA") return;

                const messageId = event.data.id;

                if (typeof messageId !== "string") return;

                try {

                    // Process data
                    await callback(event.data.value);

                    // Automatic positive acknowledgement
                    event.source.postMessage({
                        type: "TLIB_BRIDGE_ACK",
                        id: messageId,
                        ok: true
                    }, event.origin);

                } catch (error) {

                    console.error(
                        "[tlib.CrossTabBridge] Receiver callback error:",
                        error
                    );

                    // Automatic negative acknowledgement
                    event.source.postMessage({
                        type: "TLIB_BRIDGE_ACK",
                        id: messageId,
                        ok: false,
                        error: String(error)
                    }, event.origin);

                }
            };

            window.addEventListener("message", listener);

            // Announce readiness to the opener
            if (window.opener) {

                for (const origin of allowedOrigins) {

                    window.opener.postMessage({
                        type: "TLIB_BRIDGE_READY"
                    }, origin);

                }

            } else {

                console.error(
                    "[tlib.CrossTabBridge] No opener window found."
                );

            }

            // Return cleanup function
            return () => {
                window.removeEventListener("message", listener);
            };
        }

    }

// PageAutomation class for tlib.js
// Paste this class into tlib.js, then attach it to the exported tlib object
// using: tlib.PageAutomation = PageAutomation;
class PageAutomation {
    static VERSION = '4.0.0';
    static _messageStore = Object.create(null);
    static _activeContexts = new Set();
    static _receiverRemove = null;
    static _receiverStarted = false;

    static matchesURL(value, pattern) {
        try {
            const url = value instanceof URL ? value : new URL(String(value));
            const rule = String(pattern || '').trim();
            if (rule === '<all_urls>') return true;
            const match = rule.match(/^(\*|https?|file|ftp):\/\/([^/]*)(\/.*)$/i);
            if (!match) return false;
            const [, schemePattern, hostPatternRaw, pathPattern] = match;
            const scheme = url.protocol.replace(/:$/, '').toLowerCase();
            const schemePatternLower = schemePattern.toLowerCase();
            if (schemePatternLower === '*') {
                if (!['http', 'https'].includes(scheme)) return false;
            } else if (scheme !== schemePatternLower) return false;

            const hostPattern = hostPatternRaw.toLowerCase();
            const hostname = url.hostname.toLowerCase();
            if (hostPattern === '*') {
                // Any host.
            } else if (hostPattern.startsWith('*.')) {
                const suffix = hostPattern.slice(2);
                if (hostname !== suffix && !hostname.endsWith(`.${suffix}`)) return false;
            } else if (hostname !== hostPattern) return false;

            const escaped = pathPattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
            const pathRegex = new RegExp(`^${escaped}$`);
            return pathRegex.test(`${url.pathname}${url.search}`);
        } catch {
            return false;
        }
    }

    static getElements(selector) {
        if (!selector || !String(selector).trim()) throw new Error('CSS selector is required.');
        let elements;
        try { elements = Array.from(document.querySelectorAll(selector)); }
        catch (error) { throw new Error(`Invalid selector: ${error.message}`); }
        const automationHost = document.getElementById('page-automation-host');
        elements = elements.filter(element => !automationHost?.contains(element));
        if (!elements.length) throw new Error(`No elements found: ${selector}`);
        return elements;
    }

    static getTargets(selector, options = {}) {
        const elements = this.getElements(selector);
        return options.all ? elements : elements.slice(0, 1);
    }

    static dispatchEvents(element) {
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
    }

    static readText(element) {
        if (element instanceof HTMLInputElement) {
            if (['checkbox', 'radio'].includes(element.type)) return element.checked;
            return element.value;
        }
        if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return element.value;
        return (element.innerText ?? element.textContent ?? '').trim();
    }

    static async click(selector, options = {}) {
        const elements = this.getTargets(selector, options);
        for (const element of elements) {
            element.scrollIntoView({ block: 'center', inline: 'nearest' });
            element.click();
        }
        return elements.length;
    }

    static async extractText(selector, options = {}) {
        const elements = options.all ? this.getElements(selector) : this.getTargets(selector, options);
        return elements.map(element => this.readText(element));
    }

    static async setText(selector, value, options = {}) {
        const elements = this.getTargets(selector, options);
        const text = String(value ?? '');
        for (const element of elements) {
            if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) element.value = text;
            else element.textContent = text;
            this.dispatchEvents(element);
        }
        return elements.length;
    }

    static async insertText(selector, value, options = {}) {
        const elements = this.getTargets(selector, options);
        const text = String(value ?? '');
        for (const element of elements) {
            if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
                const start = element.selectionStart ?? element.value.length;
                const end = element.selectionEnd ?? start;
                element.setRangeText(text, start, end, 'end');
            } else if (element.isContentEditable) {
                element.focus();
                let inserted = false;
                try { inserted = document.execCommand('insertText', false, text); } catch {}
                if (!inserted) element.appendChild(document.createTextNode(text));
            } else element.appendChild(document.createTextNode(text));
            this.dispatchEvents(element);
        }
        return elements.length;
    }

    static resolveCheckInput(target) {
        const element = target instanceof HTMLInputElement
            ? target
            : (target instanceof HTMLLabelElement && target.control) ||
              target.querySelector?.('input[type="checkbox"], input[type="radio"]');
        if (!(element instanceof HTMLInputElement) || !['checkbox', 'radio'].includes(element.type)) {
            throw new Error('Checkbox or radio input expected.');
        }
        return element;
    }

    static async check(selector, options = {}) {
        const targets = this.getTargets(selector, options);
        for (const target of targets) {
            const element = this.resolveCheckInput(target);
            element.checked = true;
            this.dispatchEvents(element);
        }
        return targets.length;
    }

    static async uncheck(selector, options = {}) {
        const targets = this.getTargets(selector, options);
        for (const target of targets) {
            const element = this.resolveCheckInput(target);
            if (element.type === 'radio') throw new Error('Radio buttons cannot be unchecked.');
            element.checked = false;
            this.dispatchEvents(element);
        }
        return targets.length;
    }

    static async toggle(selector, options = {}) {
        const targets = this.getTargets(selector, options);
        for (const target of targets) {
            const element = this.resolveCheckInput(target);
            if (element.type !== 'checkbox') throw new Error('Toggle requires a checkbox.');
            element.checked = !element.checked;
            this.dispatchEvents(element);
        }
        return targets.length;
    }

    static getSelectOptions(selector) {
        const select = this.getElements(selector)[0];
        if (!(select instanceof HTMLSelectElement)) throw new Error('A SELECT element is required.');
        return Array.from(select.options).map(option => ({
            value: option.value, text: option.text.trim(),
            disabled: option.disabled, selected: option.selected
        }));
    }

    static async selectOption(selector, value, options = {}) {
        const elements = this.getTargets(selector, options);
        const wanted = String(value ?? '');
        for (const element of elements) {
            if (!(element instanceof HTMLSelectElement)) throw new Error('Select option requires a SELECT element.');
            const option = Array.from(element.options).find(item => item.value === wanted) ||
                Array.from(element.options).find(item => item.text.trim() === wanted) ||
                Array.from(element.options).find(item => item.text.trim().toLowerCase() === wanted.toLowerCase());
            if (!option) throw new Error(`Option not found: ${wanted}`);
            if (option.disabled) throw new Error(`Option is disabled: ${wanted}`);
            element.value = option.value;
            this.dispatchEvents(element);
        }
        return elements.length;
    }

    static async wait(milliseconds) {
        const duration = Math.max(0, Math.min(60000, Number(milliseconds) || 0));
        const helper = globalThis.tlib?.Util?.sleep;
        if (typeof helper === 'function') await helper(duration);
        else await new Promise(resolve => setTimeout(resolve, duration));
    }

    static _bridge() {
        const library = globalThis.tlib || (typeof tlib !== 'undefined' ? tlib : null);
        return library?.CrossTabBridge || null;
    }

    // Install one persistent listener so messages that arrive before the user
    // presses a generated start button are retained for the eventual run.
    static listen() {
        const bridge = this._bridge();
        if (!bridge?.receive) return null;
        if (this._receiverStarted) return this._receiverRemove;

        let allowedOrigins = [];
        try { if (document.referrer) allowedOrigins = [new URL(document.referrer).origin]; } catch {}
        if (!allowedOrigins.length) allowedOrigins = [location.origin];

        this._receiverStarted = true;
        this._receiverRemove = bridge.receive(async data => {
            if (!data || typeof data !== 'object' || !data.namespace) return;
            const key = String(data.namespace);
            this._messageStore[key] = data.message;
            for (const context of this._activeContexts) {
                context.receivedMessages[key] = data.message;
                context.tempVars[key] = data.message;
            }
        }, { allowedOrigins });
        return this._receiverRemove;
    }

    static stopListening() {
        try { this._receiverRemove?.(); } finally { this._receiverRemove = null; this._receiverStarted = false; }
    }

    static async newTab(url, namespace, message) {
        const bridge = this._bridge();
        if (!bridge?.open) throw new Error('tlib.CrossTabBridge.open is unavailable.');
        const targetUrl = new URL(String(url || '').trim(), location.href);
        const messageNamespace = String(namespace || '').trim();
        if (!messageNamespace) throw new Error('A messaging namespace is required.');
        const result = await bridge.open(targetUrl.href, { namespace: messageNamespace, message });
        if (!result) throw new Error('Could not open the tab or transfer the message. Check popup permissions.');
        return result.window;
    }

    static _resolveValue(action, context) {
        switch (action.valueSource || 'literal') {
            case 'temp': {
                const key = action.valueVariable || '';
                if (!Object.prototype.hasOwnProperty.call(context.tempVars, key)) throw new Error(`Temporary variable not found: ${key}`);
                return context.tempVars[key];
            }
            case 'message': {
                const key = action.messageVariable || context.namespace;
                if (!Object.prototype.hasOwnProperty.call(context.receivedMessages, key)) throw new Error(`Message not received for namespace: ${key}`);
                return context.receivedMessages[key];
            }
            default: return action.value ?? '';
        }
    }

    static async _execute(action, context) {
        const options = { all: Boolean(action.all) };
        switch (action.type) {
            case 'click': return this.click(action.selector, options);
            case 'extract': {
                const values = await this.extractText(action.selector, options);
                if (action.variable) context.tempVars[action.variable] = values;
                return values;
            }
            case 'setText': return this.setText(action.selector, this._resolveValue(action, context), options);
            case 'insertText': return this.insertText(action.selector, this._resolveValue(action, context), options);
            case 'check': return this.check(action.selector, options);
            case 'uncheck': return this.uncheck(action.selector, options);
            case 'toggle': return this.toggle(action.selector, options);
            case 'selectOption': return this.selectOption(action.selector, action.value, options);
            case 'wait': return this.wait(action.value);
            case 'newTab': {
                const sources = Array.isArray(action.messageSources) && action.messageSources.length
                    ? action.messageSources : [{ type: 'url' }];
                const values = sources.map(source => {
                    if (source.type === 'url') return location.href;
                    if (source.type === 'temp') {
                        if (!Object.prototype.hasOwnProperty.call(context.tempVars, source.variable)) {
                            throw new Error(`Temporary variable not found: ${source.variable}`);
                        }
                        return context.tempVars[source.variable];
                    }
                    throw new Error(`Unknown message source: ${source.type}`);
                });
                const message = values.length === 1 ? values[0] : values;
                return this.newTab(action.url, action.namespace || context.namespace, message);
            }
            default: throw new Error(`Unsupported action: ${action.type}`);
        }
    }

    static async run(actionList, options = {}) {
        if (!Array.isArray(actionList)) throw new TypeError('PageAutomation.run expects an action array.');
        this.listen();
        const context = {
            tempVars: Object.assign(Object.create(null), this._messageStore),
            receivedMessages: Object.assign(Object.create(null), this._messageStore),
            namespace: String(options.namespace || '').trim()
        };
        this._activeContexts.add(context);

        let succeeded = 0;
        let failed = 0;
        try {
            for (let index = 0; index < actionList.length; index++) {
                if (options.shouldStop?.()) break;
                const action = actionList[index];
                try {
                    options.onLog?.(`Executing ${index + 1}/${actionList.length}`, action);
                    const result = await this._execute(action, context);
                    if (action.type === 'extract') options.onExtract?.(action, result);
                    succeeded++;
                    options.onStatus?.(index, `Completed: ${action.name || action.type}`, 'good');
                    if (action.type !== 'wait' && action.delay > 0) await this.wait(action.delay);
                } catch (error) {
                    failed++;
                    options.onStatus?.(index, `Failed: ${error.message}`, 'error');
                    if (options.continueOnError === false) throw error;
                    console.error('[PageAutomation] Action failed:', index + 1, action, error);
                }
            }
            return { succeeded, failed };
        } finally {
            this._activeContexts.delete(context);
        }
    }
}
    
    // ============================================================
    // Export
    // ============================================================

    tlib.Util = Util;
    tlib.CrossTabBridge = CrossTabBridge;
    tlib.PageAutomation = PageAutomation;

    root.tlib = tlib;

})(globalThis);

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

    // ============================================================
    // Export
    // ============================================================

    tlib.Util = Util;
    tlib.CrossTabBridge = CrossTabBridge;

    root.tlib = tlib;

})(globalThis);

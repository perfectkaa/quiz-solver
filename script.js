// ==UserScript==
// @name         Universal Quiz Solver AI
// @namespace    scolver.universal
// @version      68.0
// @description  Solver kuis/form universal — regex web scrape (Trusted-Types safe)
// @author       PerfectKaa
// @icon         https://tse1.mm.bing.net/th/id/OIP.Ydweh29BuHk_PGD4dGJXbAHaHa?rs=1&pid=ImgDetMain
// @match        *://quizizz.com/*
// @match        *://wayground.com/*
// @match        *://kahoot.it/*
// @match        *://create.kahoot.it/*
// @match        *://*.blooket.com/*
// @match        *://quizlet.com/*
// @match        *://*.quizalize.com/*
// @match        *://docs.google.com/forms/d/e/*
// @match        *://docs.google.com/forms/d/*/viewform*
// @match        *://docs.google.com/forms/d/*/preview*
// @match        *://docs.google.com/forms/d/*/closedform*
// @grant        GM_xmlhttpRequest
// @connect      ollama.com
// @connect      duckduckgo.com
// @connect      bing.com
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        timeoutMs: 30000,
        searchTimeoutMs: 15000,
        semanticMaxInputs: 60,
        storageKey: 'universal-solver-ai-config',
        defaults: {
            label: 'Ollama Cloud',
            baseUrl: 'https://ollama.com',
            endpoint: '/api/chat',
            apiKey: '',
            model: 'qwen2.5:72b',
            vision: false,
            temperature: 0.2,
            topP: 0.9,
            topK: 40,
            repeatPenalty: 1.1,
            numCtx: 8192,
            numPredict: 512,
            webSearch: true,
            webSearchEngine: 'auto',
            webSearchMaxResults: 4,
        },
    };

    const LOG = {
        lines: [],
        max: 200,
        clear() { this.lines = []; this._render(); },
        add(msg) {
            const t = new Date().toLocaleTimeString('id-ID', { hour12: false });
            this.lines.push(`[${t}] ${msg}`);
            if (this.lines.length > this.max) this.lines.shift();
            this._render();
            console.log(`[Solver] ${msg}`);
        },
        _render() {
            const v = document.getElementById('ai-response-viewer');
            if (!v) return;
            v.textContent = this.lines.join('\n');
            v.scrollTop = v.scrollHeight;
        },
    };

    const U = {
        sleep: (ms) => new Promise((r) => setTimeout(r, ms)),

        waitFor(selector, { all = false, timeout = 5000, root = document } = {}) {
            return new Promise((resolve, reject) => {
                const start = Date.now();
                const tick = () => {
                    const el = all ? root.querySelectorAll(selector) : root.querySelector(selector);
                    if ((all && el.length > 0) || (!all && el)) return resolve(el);
                    if (Date.now() - start > timeout) return reject(new Error(`Timeout: "${selector}"`));
                    setTimeout(tick, 100);
                };
                tick();
            });
        },

        waitGone(selector, { timeout = 4000, root = document } = {}) {
            return new Promise((resolve, reject) => {
                const start = Date.now();
                const tick = () => {
                    if (!root.querySelector(selector)) return resolve();
                    if (Date.now() - start > timeout) return reject(new Error(`Timeout waiting for "${selector}"`));
                    setTimeout(tick, 100);
                };
                tick();
            });
        },

        async urlToBase64(url) {
            try {
                const parsed = new URL(url, location.href);
                parsed.searchParams.set('_t', Date.now());
                const ctrl = new AbortController();
                const timer = setTimeout(() => ctrl.abort(), CONFIG.timeoutMs);
                const res = await fetch(parsed.href, { cache: 'no-store', signal: ctrl.signal }).finally(() => clearTimeout(timer));
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const blob = await res.blob();
                return await new Promise((resolve, reject) => {
                    const fr = new FileReader();
                    fr.onloadend = () => resolve(fr.result);
                    fr.onerror = reject;
                    fr.readAsDataURL(blob);
                });
            } catch (e) {
                LOG.add(`[Img] gagal: ${e.message}`);
                return null;
            }
        },

        dismissPopper() {
            const opts = { bubbles: true, cancelable: true, view: window, button: 0 };
            document.dispatchEvent(new MouseEvent('mousedown', opts));
            document.dispatchEvent(new MouseEvent('mouseup', opts));
            document.dispatchEvent(new MouseEvent('click', opts));
            document.body.dispatchEvent(new MouseEvent('mousedown', opts));
            document.body.dispatchEvent(new MouseEvent('click', opts));
        },

        text(el) {
            return (el?.textContent || '').trim().replace(/\s+/g, ' ');
        },

        normalize(s) {
            return String(s || '')
                .toLowerCase()
                .replace(/[^a-z0-9\u00C0-\u017F²³\s]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
        },

        parsePairs(text, stripRegex = /[`"']/g) {
            return text.split('\n')
                .map((line) => {
                    const parts = line.split('->');
                    if (parts.length !== 2) return null;
                    return [parts[0].replace(stripRegex, '').trim(), parts[1].replace(stripRegex, '').trim()];
                })
                .filter(Boolean);
        },

        highlight(el, color) {
            if (!el) return;
            el.style.cssText += `box-shadow: 0 0 15px 5px ${color}; border: 2px solid ${color} !important; border-radius: 8px;`;
        },

        isVisible(el) {
            if (!el) return false;
            const st = window.getComputedStyle(el);
            if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        },

        setNativeValue(el, value) {
            const proto = el.tagName === 'TEXTAREA'
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
            if (setter) setter.call(el, value);
            else el.value = value;
        },

        cleanQuery(q) {
            if (!q) return '';
            let t = String(q)
                .replace(/["'`]/g, '')
                .replace(/[*_·…]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .replace(/^(apa(?:kah)?|siapa(?:kah)?|kapan(?:kah)?|di\s?mana|bagaimana(?:kah)?|mengapa|kenapa|berapa|sebutkan(?:lah)?|jelaskan(?:lah)?|uraikan(?:lah)?|tuliskan(?:lah)?|apakah|bisakah|dapatkah)\s+/i, '')
                .replace(/\s+(?:yang|adalah|itu|ini)\s+/gi, ' ')
                .replace(/\s+oleh\s+/gi, ' ')
                .replace(/[?.!,;:]+$/g, '')
                .replace(/\s+/g, ' ')
                .trim();
            if (t.length > 180) t = t.slice(0, 180);
            return t;
        },

        gmRequest({ method = 'GET', url, headers = {}, data = null, timeout = CONFIG.timeoutMs }) {
            return new Promise((resolve, reject) => {
                if (typeof GM_xmlhttpRequest !== 'function') {
                    return reject(new Error('GM_xmlhttpRequest tidak tersedia.'));
                }
                GM_xmlhttpRequest({
                    method, url, headers, data, timeout,
                    onload: (res) => resolve(res),
                    onerror: () => reject(new Error('Koneksi gagal.')),
                    ontimeout: () => reject(new Error('Request timeout.')),
                });
            });
        },
    };

    const AIConfig = {
        load() {
            try {
                const saved = JSON.parse(localStorage.getItem(CONFIG.storageKey) || '{}');
                const merged = { ...CONFIG.defaults, ...saved };
                if (!merged.model || merged.model === 'gemma4:31b' || merged.model === 'gpt-oss:120b') {
                    merged.model = CONFIG.defaults.model;
                }
                return merged;
            } catch {
                return { ...CONFIG.defaults };
            }
        },
        save(config) {
            localStorage.setItem(CONFIG.storageKey, JSON.stringify(config));
        },
    };

    class AIManager {
        constructor() {
            this.cfg = AIConfig.load();
            this.lastRaw = '';
        }
        get activeLabel() { return this.cfg.label || this.cfg.model || 'Custom AI'; }
        update(config) {
            this.cfg = { ...this.cfg, ...config };
            AIConfig.save(this.cfg);
        }

        async solve({ prompt, image }) {
            const cfg = this.cfg;
            if (!cfg.baseUrl.trim()) throw new Error('Base URL wajib diisi.');
            if (!cfg.model.trim()) throw new Error('Nama model wajib diisi.');
            if (!cfg.apiKey.trim()) throw new Error('API Key Ollama wajib diisi.');

            const baseUrl = cfg.baseUrl.trim().replace(/\/+$/, '');
            const endpoint = '/' + cfg.endpoint.trim().replace(/^\/+/, '');
            const payload = {
                model: cfg.model.trim(),
                messages: [
                    {
                        role: 'system',
                        content: 'Kamu adalah mesin penjawab kuis. Jika ada "KONTEKS DARI WEB", WAJIB jawab berdasarkan konteks itu — abaikan pengetahuan internalmu jika bertentangan. Jawab LANGSUNG tanpa penjelasan. Untuk pilihan ganda: jawab HANYA satu huruf opsi. Untuk isian: kata/frasa singkat. Jangan menolak menjawab.',
                    },
                    { role: 'user', content: prompt },
                ],
                stream: false,
                options: {
                    temperature: Number(cfg.temperature),
                    top_p: Number(cfg.topP),
                    top_k: Number(cfg.topK),
                    repeat_penalty: Number(cfg.repeatPenalty),
                    num_ctx: Number(cfg.numCtx),
                    num_predict: Number(cfg.numPredict),
                },
            };
            if (image && cfg.vision) payload.messages[1].images = [image.data];

            const res = await U.gmRequest({
                method: 'POST',
                url: `${baseUrl}${endpoint}`,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${cfg.apiKey.trim()}`,
                },
                data: JSON.stringify(payload),
            });

            let body;
            try { body = JSON.parse(res.responseText || '{}'); }
            catch { throw new Error(`Respons bukan JSON (HTTP ${res.status}).`); }
            if (res.status < 200 || res.status >= 300) {
                throw new Error(body.error || body.message || `HTTP ${res.status}`);
            }
            const answer = body.message?.content;
            this.lastRaw = typeof answer === 'string' ? answer : JSON.stringify(body);
            if (!answer) throw new Error(body.error || 'Respons kosong.');
            return answer;
        }

        async webSearch(query) {
            const cfg = this.cfg;
            const engines = cfg.webSearchEngine === 'auto'
                ? ['ddglite', 'bing', 'ddghtml']
                : [cfg.webSearchEngine];
            const maxResults = Math.max(1, Math.min(10, Number(cfg.webSearchMaxResults) || 4));
            LOG.add(`[Search] Query: "${query}"`);
            for (const eng of engines) {
                try {
                    const results = await this._scrapeSearch(eng, query, maxResults);
                    if (results.length > 0) {
                        LOG.add(`[Search] ${eng}: ${results.length} hasil ✓`);
                        return results;
                    }
                    LOG.add(`[Search] ${eng}: 0 hasil`);
                } catch (e) {
                    LOG.add(`[Search] ${eng}: gagal (${e.message})`);
                }
            }
            LOG.add('[Search] ⚠ SEMUA ENGINE GAGAL — AI jawab tanpa konteks');
            return [];
        }

        _scrapeSearch(engine, query, maxResults) {
            const q = encodeURIComponent(query);
            const urls = {
                ddglite: `https://lite.duckduckgo.com/lite/?q=${q}&kl=wt-wt`,
                ddghtml: `https://html.duckduckgo.com/html/?q=${q}&kl=wt-wt`,
                bing: `https://www.bing.com/search?q=${q}&setlang=id&cc=ID`,
            };
            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            };
            return U.gmRequest({ method: 'GET', url: urls[engine], headers, timeout: CONFIG.searchTimeoutMs })
                .then((res) => {
                    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
                    const html = res.responseText || '';
                    if (/challenge-form|anomaly-modal|captcha|verify you are human/i.test(html) && html.length < 20000) {
                        throw new Error('CAPTCHA detected');
                    }
                    LOG.add(`[Search] ${engine}: ${html.length}B HTML`);
                    return this._parseHTML(html, engine, maxResults);
                });
        }

        _parseHTML(html, engine, maxResults) {
            const out = [];
            if (engine === 'ddglite') {
                const anchors = this._extractAnchors(html, 'result-link');
                const snippets = this._extractElems(html, 'td', 'result-snippet');
                for (let i = 0; i < anchors.length && out.length < maxResults; i++) {
                    const a = anchors[i];
                    if (!/^https?:\/\//i.test(a.href)) continue;
                    out.push({ title: a.text, url: a.href, content: snippets[i] || '' });
                }
            } else if (engine === 'ddghtml') {
                const links = this._extractAnchors(html, 'result__a');
                const snippets = this._extractAnchors(html, 'result__snippet');
                for (let i = 0; i < links.length && out.length < maxResults; i++) {
                    const a = links[i];
                    if (!/^https?:\/\//i.test(a.href)) continue;
                    out.push({ title: a.text, url: a.href, content: snippets[i]?.text || '' });
                }
                for (const r of out) {
                    if (r.url.startsWith('//duckduckgo.com/l/?uddg=')) {
                        try {
                            const u = new URL('https:' + r.url);
                            r.url = decodeURIComponent(u.searchParams.get('uddg') || r.url);
                        } catch { /* keep */ }
                    }
                }
            } else if (engine === 'bing') {
                const parts = html.split(/<li\b[^>]*class=['"][^'"]*b_algo[^'"]*['"][^>]*>/i);
                parts.shift();
                for (const chunk of parts) {
                    if (out.length >= maxResults) break;
                    const h2M = chunk.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i);
                    if (!h2M) continue;
                    const aM = h2M[1].match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i);
                    if (!aM) continue;
                    const hrefM = aM[1].match(/href\s*=\s*['"]([^'"]+)['"]/i);
                    if (!hrefM) continue;
                    const title = this._cleanText(aM[2]);
                    const url = this._decodeAttr(hrefM[1]);
                    if (!/^https?:\/\//i.test(url)) continue;
                    const snipM = chunk.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i);
                    const content = snipM ? this._cleanText(snipM[1]) : '';
                    out.push({ title, url, content });
                }
            }
            return out;
        }

        _extractAnchors(html, classFilter) {
            const out = [];
            const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
            let m;
            const clsRe = new RegExp(`class\\s*=\\s*['"][^'"]*${classFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^'"]*['"]`, 'i');
            while ((m = re.exec(html)) !== null) {
                const attrs = m[1];
                if (!clsRe.test(attrs)) continue;
                const hrefM = attrs.match(/href\s*=\s*['"]([^"']+)['"]/i);
                if (!hrefM) continue;
                out.push({ href: this._decodeAttr(hrefM[1]), text: this._cleanText(m[2]) });
            }
            return out;
        }

        _extractElems(html, tag, classFilter) {
            const out = [];
            const safeTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp(`<${safeTag}\\b([^>]*)>([\\s\\S]*?)<\\/${safeTag}>`, 'gi');
            let m;
            const clsRe = new RegExp(`class\\s*=\\s*['"][^'"]*${classFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^'"]*['"]`, 'i');
            while ((m = re.exec(html)) !== null) {
                if (!clsRe.test(m[1])) continue;
                out.push(this._cleanText(m[2]));
            }
            return out;
        }

        _cleanText(html) {
            let s = String(html || '');
            s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
            s = s.replace(/<style[\s\S]*?<\/style>/gi, '');
            s = s.replace(/<[^>]*>/g, ' ');
            s = s.replace(/&nbsp;/g, ' ');
            s = s.replace(/&amp;/g, '&');
            s = s.replace(/&lt;/g, '<');
            s = s.replace(/&gt;/g, '>');
            s = s.replace(/&quot;/g, '"');
            s = s.replace(/&#39;/g, "'");
            s = s.replace(/&#x27;/g, "'");
            s = s.replace(/&#x2F;/g, '/');
            s = s.replace(/\s+/g, ' ');
            return s.trim();
        }

        _decodeAttr(s) {
            return String(s || '')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/&#x27;/g, "'")
                .replace(/&#x2F;/g, '/');
        }
    }

    class BaseAdapter {
        matches(_url) { return false; }
        async extract() { throw new Error('extract() belum diimplementasi'); }
        async apply(_solution, _payload) { throw new Error('apply() belum diimplementasi'); }
        buildPrompt(_payload) { throw new Error('buildPrompt() belum diimplementasi'); }
    }

    class QuizizzAdapter extends BaseAdapter {
        matches(url) {
            try { return /(^|\.)(quizizz\.com|wayground\.com)$/i.test(new URL(url).hostname); }
            catch { return false; }
        }

        async extract() {
            const qNode = document.querySelector('#questionText');
            const qText = qNode ? U.text(qNode) : 'Teks pertanyaan tidak ditemukan.';
            const qImg = document.querySelector('img[data-testid="question-container-image"]')?.src || null;

            const optText = (el) => {
                const annot = el.querySelector('annotation[encoding="application/x-tex"]');
                if (annot) return annot.textContent.trim();
                return U.text(el.querySelector('#optionText') || el);
            };

            const dropdowns = document.querySelectorAll('button.options-dropdown');
            if (dropdowns.length > 1) {
                const pool = await this._readDropdownPool(dropdowns[0]);
                let markup = qNode.innerHTML;
                const entries = [];
                dropdowns.forEach((btn, i) => {
                    const placeholder = ` [RESPOSTA ${i + 1}] `;
                    const wrap = btn.closest('.dropdown-wrapper');
                    if (wrap) markup = markup.replace(wrap.outerHTML, placeholder);
                    entries.push({ button: btn, placeholder: `[RESPOSTA ${i + 1}]` });
                });
                const tmp = document.createElement('div');
                tmp.innerHTML = markup;
                return { type: 'multi_dropdown', questionText: U.text(tmp), questionImageUrl: qImg, dropdowns: entries, optionsPool: pool };
            }
            if (dropdowns.length === 1) {
                return { type: 'dropdown', questionText: qText, questionImageUrl: qImg, dropdownButton: dropdowns[0] };
            }
            if (document.querySelector('div[data-cy="equation-editor"]')) {
                return { type: 'equation', questionText: qText, questionImageUrl: qImg };
            }

            const imgZones = document.querySelectorAll('.drag-and-drop-image-blank');
            const imgDrags = document.querySelectorAll('.drag-option-dnd-image');
            if (imgZones.length && imgDrags.length) {
                const bg = document.querySelector('.image-container img')?.src || null;
                const draggables = Array.from(imgDrags).map((el) => ({ text: U.text(el), element: el }));
                const sortedZones = Array.from(imgZones)
                    .map((el) => ({ el, ...el.getBoundingClientRect().toJSON() }))
                    .sort((a, b) => (Math.abs(a.top - b.top) > 20 ? a.top - b.top : a.left - b.left))
                    .map(({ el }, i) => ({ id: `RUANG ${i + 1}`, element: el }));
                return { type: 'drag_and_drop_image', questionText: qText, questionImageUrl: bg, draggableOptions: draggables, dropZones: sortedZones };
            }

            const blanks = document.querySelectorAll('button.droppable-blank');
            const dragPills = document.querySelectorAll('.drag-option');
            if (blanks.length > 1 && dragPills.length) {
                const container = document.querySelector('.drag-drop-text > div');
                const zones = [];
                if (container) {
                    const children = Array.from(container.children);
                    children.forEach((child, i) => {
                        const blank = child.querySelector('button.droppable-blank');
                        const prev = children[i - 1];
                        if (blank && prev?.tagName === 'SPAN') {
                            zones.push({ prompt: U.text(prev).replace(/:\s*$/, ''), blankElement: blank });
                        }
                    });
                }
                return {
                    type: 'multi_drag_into_blank',
                    questionText: container ? U.text(container) : qText,
                    questionImageUrl: qImg,
                    draggableOptions: Array.from(dragPills).map((el) => ({ text: U.text(el), element: el })),
                    dropZones: zones,
                };
            }
            if (blanks.length === 1 && dragPills.length) {
                return {
                    type: 'drag_into_blank',
                    questionText: qText,
                    questionImageUrl: qImg,
                    draggableOptions: Array.from(dragPills).map((el) => ({ text: U.text(el.querySelector('.dnd-option-text') || el), element: el })),
                    dropZone: { element: blanks[0] },
                };
            }

            if (document.querySelector('.classification-question, .classification-layout, .classification-layout-evaluation-completed')) {
                const cats = Array.from(document.querySelectorAll('.list-group')).map((el) => ({
                    name: U.text(el.querySelector('.bg-gradient-to-b span, span')) || 'Kategori',
                    element: el,
                }));
                const seen = new Set();
                const drags = [];
                document.querySelectorAll('.cursor-grab, .classification-option-text-container').forEach((el) => {
                    const card = el.closest('.cursor-grab') || el.closest('[id]') || el;
                    const label = U.text(el);
                    if (label && !seen.has(label)) { seen.add(label); drags.push({ text: label, element: card }); }
                });
                if (cats.length && drags.length) {
                    return { type: 'categorize', questionText: qText, questionImageUrl: qImg, categories: cats, draggables: drags };
                }
            }

            const matchContainer = document.querySelector('.match-order-options-container, .question-options-layout');
            if (matchContainer) {
                const dragTiles = Array.from(matchContainer.querySelectorAll('.match-order-option.is-option-tile'));
                const dropTiles = Array.from(matchContainer.querySelectorAll('.match-order-option.is-drop-tile'));
                if (dragTiles.length && dragTiles[0].querySelector('.option-image')) {
                    const items = [];
                    dragTiles.forEach((tile, i) => {
                        const bg = tile.querySelector('.option-image');
                        let url = bg ? window.getComputedStyle(bg).backgroundImage.match(/url\("(.+?)"\)/)?.[1] : null;
                        if (!url) {
                            const cy = tile.dataset.cy || '';
                            url = cy.match(/url\((.+)\)/)?.[1]?.replace(/\?w=\d+&h=\d+$/, '') || null;
                        }
                        if (url) items.push({ id: `GAMBAR ${i + 1}`, imageUrl: url, element: tile });
                    });
                    return {
                        type: 'match_image_to_text',
                        questionText: qText,
                        questionImageUrl: qImg,
                        draggableItems: items,
                        dropZones: dropTiles.map((el) => ({ text: optText(el), element: el })),
                    };
                }
                if (dragTiles.length && dropTiles.length) {
                    return {
                        type: /reorder/i.test(qText) ? 'reorder' : 'match_order',
                        questionText: qText,
                        questionImageUrl: qImg,
                        draggableItems: dragTiles.map((el) => ({ text: optText(el), element: el })),
                        dropZones: dropTiles.map((el) => ({ text: optText(el), element: el })),
                    };
                }
            }

            const openEnded = document.querySelector('textarea[data-cy="open-ended-textarea"]');
            if (openEnded) {
                return { type: 'open_ended', questionText: qText, questionImageUrl: qImg, answerElement: openEnded };
            }

            const options = document.querySelectorAll('.option.is-selectable');
            if (options.length) {
                const multi = Array.from(options).some((el) => el.classList.contains('is-msq'));
                return {
                    type: multi ? 'multiple_choice' : 'single_choice',
                    questionText: qText,
                    questionImageUrl: qImg,
                    options: Array.from(options).map((el) => ({ text: optText(el), element: el })),
                };
            }

            throw new Error('Tipe soal tidak dikenali.');
        }

        async _readDropdownPool(trigger) {
            try {
                trigger.click();
                const nodes = await U.waitFor('.v-popper__popper--shown button.dropdown-option', { all: true, timeout: 2000 });
                const pool = Array.from(nodes).map((el) => U.text(el));
                U.dismissPopper();
                await U.waitGone('.v-popper__popper--shown', { timeout: 2000 }).catch(() => {});
                return pool;
            } catch { U.dismissPopper(); return []; }
        }

        buildPrompt(q) {
            const base = { instruction: '', optionsBlock: '' };
            switch (q.type) {
                case 'drag_and_drop_image':
                    base.instruction = `Soal menyeret label ke gambar. Ruang (RUANG N) diurutkan atas-bawah, kiri-kanan. Format PERSIS: 'RUANG X -> Nama Label' (satu per baris).`;
                    base.optionsBlock = `Label:\n${q.draggableOptions.map((i) => `- "${i.text}"`).join('\n')}\n\nRuang:\n${q.dropZones.map((i) => `- "${i.id}"`).join('\n')}`;
                    break;
                case 'categorize':
                    base.instruction = `Soal kategorisasi. Format: 'Teks Item -> Nama Kategori' (satu per baris).`;
                    base.optionsBlock = `Kategori:\n${q.categories.map((c) => `- "${c.name}"`).join('\n')}\n\nItem:\n${q.draggables.map((i) => `- "${i.text}"`).join('\n')}`;
                    break;
                case 'multi_dropdown':
                    base.instruction = `Soal dengan beberapa celah [RESPOSTA X]. Pool bersama — setiap opsi dipakai sekali. Jawab '[RESPOSTA X]: Jawaban' (satu per baris).`;
                    base.optionsBlock = `Pool opsi: ${q.optionsPool.join(', ')}`;
                    break;
                case 'match_image_to_text':
                    base.instruction = `Cocokkan gambar dengan teks. Format PERSIS: 'Teks -> GAMBAR N' (satu per baris).`;
                    base.optionsBlock = `Teks:\n${q.dropZones.map((i) => `- "${i.text}"`).join('\n')}`;
                    break;
                case 'match_order':
                    base.instruction = `Format PERSIS: 'Item Target -> Item Seret' (satu per baris).`;
                    base.optionsBlock = `Item Seret:\n${q.draggableItems.map((i) => `- "${i.text}"`).join('\n')}\n\nTarget:\n${q.dropZones.map((i) => `- "${i.text}"`).join('\n')}`;
                    break;
                case 'multi_drag_into_blank':
                    base.instruction = `Cocokkan kalimat dengan ekspresi. Format: 'Kalimat -> Ekspresi' (satu per baris).`;
                    base.optionsBlock = `Kalimat:\n${q.dropZones.map((i) => `- "${i.prompt}"`).join('\n')}\n\nEkspresi:\n${q.draggableOptions.map((i) => `- "${i.text}"`).join('\n')}`;
                    break;
                case 'equation':
                    base.instruction = `Selesaikan persamaan. Jawab HANYA ekspresi akhir (mis: x = 5).`;
                    base.optionsBlock = `Persamaan: "${q.questionText}"`;
                    break;
                case 'dropdown':
                case 'single_choice':
                    base.instruction = `Jawab HANYA dengan teks persis dari satu alternatif yang benar.`;
                    base.optionsBlock = `Opsi:\n${(q.options || []).map((o) => `- "${o.text}"`).join('\n')}`;
                    break;
                case 'reorder':
                    base.instruction = `Urutkan item dengan urutan benar (satu per baris).`;
                    base.optionsBlock = `Item:\n${q.draggableItems.map((i) => `- "${i.text}"`).join('\n')}`;
                    break;
                case 'drag_into_blank':
                    base.instruction = `Jawab HANYA dengan teks opsi yang benar untuk mengisi celah.`;
                    base.optionsBlock = `Opsi:\n${q.draggableOptions.map((i) => `- "${i.text}"`).join('\n')}`;
                    break;
                case 'multiple_choice':
                    base.instruction = `Jawab HANYA teks persis dari SEMUA alternatif yang benar (satu per baris).`;
                    base.optionsBlock = `Opsi:\n${q.options.map((o) => `- "${o.text}"`).join('\n')}`;
                    break;
                case 'open_ended':
                    base.instruction = `Jawab HANYA kata/frasa singkat yang mengisi celah.`;
                    break;
            }
            return { prompt: `${base.instruction}\n\n---\nPERTANYAAN: "${q.questionText}"\n---\n${base.optionsBlock}` };
        }

        async apply(solution, q) {
            const m = {
                drag_and_drop_image: this._applyDnDImage,
                categorize: this._applyCategorize,
                multi_dropdown: this._applyMultiDropdown,
                multi_drag_into_blank: this._applyMultiDrag,
                equation: this._applyEquation,
                reorder: this._applyReorder,
                drag_into_blank: this._applyDragBlank,
                match_image_to_text: this._applyMatchImage,
                match_order: this._applyMatchOrder,
                open_ended: this._applyOpenEnded,
                multiple_choice: this._applyMultiChoice,
                single_choice: this._applySingleChoice,
            };
            const fn = m[q.type];
            if (fn) await fn.call(this, solution, q);
        }

        _applyDnDImage(text, q) {
            const palette = ['#FFD700', '#00FFFF', '#FF00FF', '#7FFF00', '#FF8C00', '#DA70D6'];
            const labelMap = new Map(q.draggableOptions.map((i) => [i.text, i.element]));
            const zoneMap = new Map(q.dropZones.map((i) => [i.id, i.element]));
            U.parsePairs(text).forEach(([zoneId, label], i) => {
                let src = labelMap.get(label);
                if (!src) src = [...labelMap.entries()].find(([k]) => k.includes(label) || label.includes(k))?.[1];
                const tgt = zoneMap.get(zoneId);
                if (src && tgt) {
                    const c = palette[i % palette.length];
                    U.highlight(src, c);
                    Object.assign(tgt.style, { backgroundColor: c, opacity: '0.9', boxShadow: `0 0 10px 5px ${c}`, border: '2px solid #fff', zIndex: '100' });
                }
            });
        }

        _applyCategorize(text, q) {
            const palette = ['#FFD700', '#00FFFF', '#FF00FF', '#7FFF00', '#FF8C00', '#DA70D6'];
            const dragMap = new Map(q.draggables.map((i) => [i.text, i.element]));
            const catMap = new Map(q.categories.map((i) => [i.name, i.element]));
            const used = new Map(); let ci = 0;
            U.parsePairs(text).forEach(([item, catName]) => {
                let src = dragMap.get(item);
                if (!src) src = [...dragMap.entries()].find(([k]) => k.includes(item) || item.includes(k))?.[1];
                let tgt = catMap.get(catName);
                if (!tgt) tgt = [...catMap.entries()].find(([k]) => k.includes(catName) || catName.includes(k))?.[1];
                if (!src || !tgt) return;
                if (!used.has(catName)) used.set(catName, palette[ci++ % palette.length]);
                const c = used.get(catName);
                U.highlight(src, c);
                tgt.style.border = `2px solid ${c}`;
                tgt.style.boxShadow = `inset 0 0 20px ${c}`;
            });
        }

        async _applyMultiDropdown(text, q) {
            const answers = new Map();
            text.split('\n').forEach((line) => {
                const mm = line.match(/\[RESPOSTA (\d+)\]:\s*(.*)/i);
                if (mm) answers.set(parseInt(mm[1], 10) - 1, mm[2].trim().replace(/["'`]/g, ''));
            });
            const SEL = '.v-popper__popper--shown button.dropdown-option';
            const EMPTY = 'Pilih jawaban';
            for (let i = 0; i < q.dropdowns.length; i++) {
                const dd = q.dropdowns[i];
                const cur = U.text(dd.button);
                const exp = answers.get(i);
                if (!((cur !== EMPTY && exp && cur !== exp) || (cur !== EMPTY && !exp))) continue;
                dd.button.click();
                try {
                    const nodes = await U.waitFor(SEL, { all: true, timeout: 2000 });
                    const match = Array.from(nodes).find((el) => U.text(el) === cur);
                    match ? match.click() : U.dismissPopper();
                    await U.waitGone('.v-popper__popper--shown', { timeout: 2000 });
                } catch { U.dismissPopper(); }
            }
            for (const [idx, ans] of answers) {
                const dd = q.dropdowns[idx];
                if (!dd || U.text(dd.button) === ans) continue;
                dd.button.click();
                try {
                    const nodes = await U.waitFor(SEL, { all: true, timeout: 2000 });
                    const match = Array.from(nodes).find((el) => U.text(el) === ans);
                    if (match && !match.disabled) match.click();
                    else U.dismissPopper();
                    await U.waitGone('.v-popper__popper--shown', { timeout: 2000 });
                } catch { U.dismissPopper(); }
            }
        }

        _applyMultiDrag(text, q) {
            const palette = ['#FFD700', '#00FFFF', '#FF00FF', '#7FFF00', '#FF8C00', '#DA70D6'];
            const dragMap = new Map(q.draggableOptions.map((i) => [i.text, i.element]));
            const zoneMap = new Map(q.dropZones.map((i) => [i.prompt, i.blankElement]));
            U.parsePairs(text).forEach(([sentence, expr], i) => {
                const key = [...zoneMap.keys()].find((k) => k.includes(sentence) || sentence.includes(k));
                const blank = zoneMap.get(key);
                const opt = dragMap.get(expr);
                if (blank && opt) {
                    const c = palette[i % palette.length];
                    U.highlight(blank, c);
                    U.highlight(opt, c);
                }
            });
        }

        async _applyEquation(text) {
            const KEYMAP = {
                '0': 'icon-fas-0', '1': 'icon-fas-1', '2': 'icon-fas-2', '3': 'icon-fas-3', '4': 'icon-fas-4',
                '5': 'icon-fas-5', '6': 'icon-fas-6', '7': 'icon-fas-7', '8': 'icon-fas-8', '9': 'icon-fas-9',
                '+': 'icon-fas-plus', '-': 'icon-fas-minus', '*': 'icon-fas-times', '×': 'icon-fas-times',
                '/': 'icon-fas-divide', '÷': 'icon-fas-divide', '=': 'icon-fas-equals', '.': 'icon-fas-period',
                '<': 'icon-fas-less-than', '>': 'icon-fas-greater-than',
                '≤': 'icon-fas-less-than-equal', '≥': 'icon-fas-greater-than-equal',
                'x': 'icon-fas-variable', 'y': 'icon-fas-variable', 'z': 'icon-fas-variable',
                '(': 'icon-fas-brackets-round', ')': 'icon-fas-brackets-round',
                'π': 'icon-fas-pi', 'e': 'icon-fas-euler',
            };
            const seq = text.trim().replace(/\s/g, '').replace(/<=/g, '≤').replace(/>=/g, '≥');
            const editor = document.querySelector('div[data-cy="equation-editor"]');
            if (!editor) return;
            editor.click();
            await U.sleep(120);
            for (const ch of seq) {
                const cls = KEYMAP[ch.toLowerCase()];
                if (!cls) continue;
                const btn = document.querySelector(`.editor-button i.${cls}`)?.closest('button');
                if (btn) { btn.click(); await U.sleep(90); }
            }
        }

        _applyReorder(text, q) {
            const order = text.split('\n').map((s) => s.replace(/["'`]/g, '').trim()).filter(Boolean);
            const map = new Map(q.draggableItems.map((i) => [i.text, i.element]));
            if (order.length !== q.dropZones.length) return;
            order.forEach((label, i) => {
                const src = map.get(label);
                const tgt = q.dropZones[i].element;
                if (src && tgt) {
                    const c = getComputedStyle(src).borderColor || '#00FF00';
                    U.highlight(src, c);
                    U.highlight(tgt, c);
                }
            });
        }

        _applyDragBlank(text, q) {
            const ans = text.trim().replace(/["'`]/g, '');
            const opt = q.draggableOptions.find((o) => o.text === ans);
            if (opt) {
                const c = getComputedStyle(opt.element).borderColor || '#00FF00';
                U.highlight(opt.element, c);
                U.highlight(q.dropZone.element, c);
            }
        }

        _applyMatchImage(text, q) {
            const palette = ['#FFD700', '#00FFFF', '#FF00FF', '#7FFF00', '#FF8C00', '#DA70D6'];
            const imgMap = new Map(q.draggableItems.map((i) => [i.id, i.element]));
            const txtMap = new Map(q.dropZones.map((i) => [i.text, i.element]));
            U.parsePairs(text, /[`"\[\]]/g).forEach(([a, b], i) => {
                let src, tgt;
                if (txtMap.has(a) && imgMap.has(b)) { tgt = txtMap.get(a); src = imgMap.get(b); }
                else if (txtMap.has(b) && imgMap.has(a)) { tgt = txtMap.get(b); src = imgMap.get(a); }
                if (src && tgt) {
                    const c = palette[i % palette.length];
                    U.highlight(src, c);
                    U.highlight(tgt, c);
                }
            });
        }

        _applyMatchOrder(text, q) {
            const dragMap = new Map(q.draggableItems.map((i) => [i.text, i.element]));
            const dropMap = new Map(q.dropZones.map((i) => [i.text, i.element]));
            U.parsePairs(text).forEach(([a, b]) => {
                let src, tgt;
                if (dropMap.has(a) && dragMap.has(b)) { tgt = dropMap.get(a); src = dragMap.get(b); }
                else if (dropMap.has(b) && dragMap.has(a)) { tgt = dropMap.get(b); src = dragMap.get(a); }
                if (src && tgt) {
                    U.highlight(src, '#00FF00');
                    U.highlight(tgt, '#00FF00');
                }
            });
        }

        async _applyOpenEnded(text, q) {
            q.answerElement.focus();
            q.answerElement.value = text.trim();
            q.answerElement.dispatchEvent(new Event('input', { bubbles: true }));
            await U.sleep(80);
            setTimeout(() => document.querySelector('.submit-button-wrapper button, button.submit-btn')?.click(), 400);
        }

        _applyMultiChoice(text, q) {
            const wanted = new Set(text.split('\n').map(U.normalize).filter(Boolean));
            q.options.forEach((o) => {
                if (wanted.has(U.normalize(o.text))) {
                    o.element.style.border = '5px solid #00FF00';
                    o.element.click();
                }
            });
        }

        _applySingleChoice(text, q) {
            const ans = U.normalize(text);
            const match = q.options.find((o) => U.normalize(o.text) === ans);
            if (match) {
                match.element.style.border = '5px solid #00FF00';
                match.element.click();
            } else {
                LOG.add(`[Apply] ⚠ "${text}" tidak cocok dengan opsi manapun`);
            }
        }
    }

    class GoogleFormsAdapter extends BaseAdapter {
        matches(url) {
            try {
                const u = new URL(url);
                if (u.hostname !== 'docs.google.com') return false;
                return u.pathname.startsWith('/forms/d/e/') ||
                       /\/(viewform|preview|closedform)/.test(u.pathname);
            } catch { return false; }
        }

        async extract() {
            const items = document.querySelectorAll('[role="listitem"]');
            const questions = [];

            items.forEach((item) => {
                const titleEl = item.querySelector('[role="heading"]');
                if (!titleEl) return;
                const title = U.text(titleEl);
                if (!title || title.length < 2) return;

                const textarea   = item.querySelector('textarea');
                const textInput  = item.querySelector('input[type="text"]:not([aria-hidden="true"])');
                const radios     = item.querySelectorAll('[role="radio"]');
                const checkboxes = item.querySelectorAll('[role="checkbox"]');
                const listbox    = item.querySelector('[role="listbox"]');

                if (textarea) {
                    questions.push({ type: 'essay', question: title, element: textarea });
                } else if (textInput) {
                    questions.push({ type: 'short_answer', question: title, element: textInput });
                } else if (radios.length > 0) {
                    questions.push({
                        type: 'multiple_choice',
                        question: title,
                        options: Array.from(radios).map((r, i) => ({
                            letter: String.fromCharCode(65 + i),
                            text: U.text(r.querySelector('.docssharedWizToggleLabeledLabelText') || r),
                            element: r,
                        })),
                    });
                } else if (checkboxes.length > 0) {
                    questions.push({
                        type: 'checkboxes',
                        question: title,
                        options: Array.from(checkboxes).map((c, i) => ({
                            letter: String.fromCharCode(65 + i),
                            text: U.text(c.querySelector('.docssharedWizToggleLabeledLabelText') || c),
                            element: c,
                        })),
                    });
                } else if (listbox) {
                    questions.push({ type: 'dropdown', question: title, element: listbox });
                }
            });

            if (questions.length === 0) throw new Error('Tidak ada pertanyaan Google Forms.');
            const formTitle = U.text(document.querySelector('[role="heading"][aria-level="1"]')) || document.title;
            return { type: 'google_form', questions, formTitle };
        }

        buildSinglePrompt(item, index, total) {
            const lines = [
                `Soal ${index + 1} dari ${total} — tipe: ${item.type}`,
                '',
                `PERTANYAAN: ${item.question}`,
                '',
            ];
            if (item.options && item.options.length) {
                lines.push('OPSI:');
                item.options.forEach((o) => lines.push(`${o.letter}. ${o.text}`));
                lines.push('');
            }
            lines.push('INSTRUKSI KERAS:');
            if (item.type === 'multiple_choice') lines.push('- Jawab HANYA satu HURUF (A/B/C/D). Tanpa titik, tanpa spasi.');
            else if (item.type === 'checkboxes') lines.push('- Jawab HANYA HURUF opsi benar, pisah koma (contoh: A, C).');
            else if (item.type === 'dropdown') lines.push('- Jawab HANYA teks persis salah satu opsi.');
            else lines.push('- Jawab langsung: kata/frasa/fakta singkat.');
            lines.push('- JANGAN tambahkan penjelasan, kalimat pembuka, atau tanda kutip.');
            return { prompt: lines.join('\n') };
        }

        async applySingle(answer, item) {
            let ans = String(answer || '').trim().split('\n')[0].trim();
            ans = ans.replace(/^["'`]+|["'`]+$/g, '');
            ans = ans.replace(/^\((essay|short_answer|multiple_choice|checkboxes|dropdown)\)\s*/i, '');
            ans = ans.replace(/^(?:jawaban|answer|pilihan|opsi|option)\s*[:=]\s*/i, '');
            ans = ans.replace(/^([A-Z])\.\s*$/, '$1');
            return this._applyOne(item, ans);
        }

        async _applyOne(item, ans) {
            switch (item.type) {
                case 'essay':
                case 'short_answer':
                    return this._fillText(item.element, ans);
                case 'multiple_choice':
                    return this._pickOne(item.options, ans);
                case 'checkboxes':
                    return this._pickMany(item.options, ans);
                case 'dropdown':
                    return this._fillDropdown(item.element, ans);
            }
            return false;
        }

        async _fillText(el, value) {
            el.focus();
            U.setNativeValue(el, value);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.blur();
            return true;
        }

        _pickOne(options, answer) {
            const m = answer.match(/^([A-Z])(?:[\.\)\s,]|$)/i);
            if (m) {
                const idx = m[1].toUpperCase().charCodeAt(0) - 65;
                if (options[idx]) { options[idx].element.click(); return true; }
            }
            const norm = U.normalize(answer);
            let tgt = options.find((o) => U.normalize(o.text) === norm);
            if (!tgt) tgt = options.find((o) => {
                const n = U.normalize(o.text);
                return n.includes(norm) || norm.includes(n);
            });
            if (tgt) { tgt.element.click(); return true; }
            return false;
        }

        _pickMany(options, answer) {
            const parts = answer.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
            let any = false;
            for (const part of parts) if (this._pickOne(options, part)) any = true;
            return any;
        }

        _fillDropdown(el, answer) {
            const opts = Array.from(el.options || []);
            const norm = U.normalize(answer);
            let opt = opts.find((o) => U.normalize(o.textContent) === norm);
            if (!opt) {
                const m = answer.match(/^([A-Z])(?:[\.\)\s]|$)/i);
                if (m) opt = opts[m[1].toUpperCase().charCodeAt(0) - 65];
            }
            if (!opt) opt = opts.find((o) => {
                const n = U.normalize(o.textContent);
                return n.includes(norm) || norm.includes(n);
            });
            if (opt) {
                el.value = opt.value;
                el.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }
            return false;
        }
    }

    class SemanticAdapter extends BaseAdapter {
        matches(_url) { return true; }

        async extract() {
            const scanSelector = [
                'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]):not([type="file"])',
                'textarea', 'select', '[role="radio"]', '[role="checkbox"]', '[role="combobox"]', '[contenteditable="true"]',
            ].join(',');
            const rawNodes = Array.from(document.querySelectorAll(scanSelector)).filter(U.isVisible);
            if (rawNodes.length === 0) throw new Error('Tidak ada input terlihat.');

            const seenGroups = new Set();
            const inputs = [];
            let nextId = 0;
            for (const el of rawNodes) {
                if (inputs.length >= CONFIG.semanticMaxInputs) break;
                const type = this._detectType(el);
                const groupKey = this._groupKey(el, type);
                if (groupKey && seenGroups.has(groupKey)) continue;
                if (groupKey) seenGroups.add(groupKey);
                const isChoice = type === 'multiple_choice' || type === 'checkboxes';
                const question = this._findQuestion(el, isChoice) || this._findLabel(el) || '';
                const options = isChoice ? this._collectOptions(el, groupKey) : null;
                inputs.push({ id: `uqs-${nextId++}`, type, question, options, element: el });
            }
            const formTitle = U.text(document.querySelector('h1, [role="heading"][aria-level="1"]')) || document.title;
            return { type: 'semantic', inputs, formTitle };
        }

        _detectType(el) {
            const tag = el.tagName.toLowerCase();
            const role = el.getAttribute('role');
            const inputType = el.getAttribute('type');
            if (tag === 'textarea') return 'essay';
            if (tag === 'select' || role === 'combobox') return 'dropdown';
            if (inputType === 'radio' || role === 'radio') return 'multiple_choice';
            if (inputType === 'checkbox' || role === 'checkbox') return 'checkboxes';
            if (['text', 'email', 'number', 'tel', 'url', 'search'].includes(inputType)) return 'short_answer';
            if (el.getAttribute('contenteditable') === 'true') return 'essay';
            return 'short_answer';
        }

        _groupKey(el, type) {
            if (type !== 'multiple_choice' && type !== 'checkboxes') return null;
            const name = el.getAttribute('name');
            if (name) return `name:${name}`;
            const grp = el.closest('[role="radiogroup"], [role="group"], fieldset');
            if (grp) {
                if (!grp.__uqsGroupKey) grp.__uqsGroupKey = `g${Math.random().toString(36).slice(2, 8)}`;
                return grp.__uqsGroupKey;
            }
            return `self:${Math.random().toString(36).slice(2, 8)}`;
        }

        _collectOptions(el, groupKey) {
            let optionEls = [];
            if (groupKey && groupKey.startsWith('name:')) {
                const name = groupKey.slice(5);
                optionEls = Array.from(document.querySelectorAll(
                    `input[type="radio"][name="${CSS.escape(name)}"], input[type="checkbox"][name="${CSS.escape(name)}"]`
                ));
            } else {
                const grp = el.closest('[role="radiogroup"], [role="group"], fieldset');
                if (grp) optionEls = Array.from(grp.querySelectorAll('[role="radio"], [role="checkbox"], input[type="radio"], input[type="checkbox"]'));
                else optionEls = [el];
            }
            return optionEls.map((o, i) => ({
                letter: String.fromCharCode(65 + i),
                text: this._findLabel(o) || U.text(o),
                element: o,
            }));
        }

        _findLabel(el) {
            if (el.id) {
                const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
                if (lbl) return U.text(lbl);
            }
            const wrap = el.closest('label');
            if (wrap) {
                const clone = wrap.cloneNode(true);
                clone.querySelectorAll('input,textarea,select,[role="radio"],[role="checkbox"]').forEach((n) => n.remove());
                const t = U.text(clone);
                if (t) return t;
            }
            const aria = el.getAttribute('aria-label');
            if (aria) return aria;
            const lb = el.getAttribute('aria-labelledby');
            if (lb) {
                const refs = lb.split(/\s+/).map((id) => document.getElementById(id)).filter(Boolean);
                const t = refs.map((r) => U.text(r)).join(' ').trim();
                if (t) return t;
            }
            const ds = el.querySelector?.('.docssharedWizToggleLabeledLabelText');
            if (ds) return U.text(ds);
            const sib = el.nextElementSibling;
            if (sib && /^(SPAN|DIV|P)$/.test(sib.tagName)) {
                const t = U.text(sib);
                if (t && t.length < 200) return t;
            }
            return '';
        }

        _findQuestion(el, isChoice) {
            let node = el.parentElement;
            let depth = 0;
            while (node && depth < 10) {
                if (node.tagName === 'LABEL') { node = node.parentElement; depth++; continue; }
                const headings = node.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]');
                for (const h of headings) {
                    if (h.contains(el)) continue;
                    const t = U.text(h);
                    if (t.length >= 3 && t.length < 500) return t;
                }
                if (!isChoice) {
                    const prev = node.previousElementSibling;
                    if (prev && !prev.contains(el)) {
                        const t = U.text(prev);
                        if (t.length >= 3 && t.length < 500) return t;
                    }
                }
                node = node.parentElement;
                depth++;
            }
            return '';
        }

        buildSinglePrompt(input, index, total, payload) {
            const formTitle = payload?.formTitle || '';
            const lines = [
                `Formulir "${formTitle || 'Tanpa Judul'}" — field ${index + 1} dari ${total}`,
                `Tipe: ${input.type}`,
                '',
                `PERTANYAAN: ${input.question || '(tanpa teks pertanyaan)'}`,
                '',
            ];
            if (input.options && input.options.length) {
                lines.push('OPSI:');
                input.options.forEach((o) => lines.push(`${o.letter}. ${o.text}`));
                lines.push('');
            }
            lines.push('INSTRUKSI KERAS:');
            if (input.type === 'multiple_choice') lines.push('- Jawab HANYA satu HURUF (A/B/C/D).');
            else if (input.type === 'checkboxes') lines.push('- Jawab HANYA HURUF opsi benar, pisah koma (contoh: A, C).');
            else if (input.type === 'dropdown') lines.push('- Jawab HANYA teks persis salah satu opsi.');
            else lines.push('- Jawab langsung: kata/frasa/fakta singkat.');
            lines.push('- JANGAN tambahkan penjelasan, kalimat pembuka, atau tanda kutip.');
            return { prompt: lines.join('\n') };
        }

        async applySingle(answer, input) {
            let ans = String(answer || '').trim().split('\n')[0].trim();
            ans = ans.replace(/^["'`]+|["'`]+$/g, '');
            ans = ans.replace(/^\((essay|short_answer|multiple_choice|checkboxes|dropdown)\)\s*/i, '');
            ans = ans.replace(/^(?:jawaban|answer|pilihan|opsi|option)\s*[:=]\s*/i, '');
            ans = ans.replace(/^([A-Z])\.\s*$/, '$1');
            return this._applyOne(input, ans);
        }

        async _applyOne(inp, answer) {
            switch (inp.type) {
                case 'essay':
                case 'short_answer':
                    return this._fillText(inp.element, answer);
                case 'multiple_choice':
                    return this._pickOption(inp.options, answer, false);
                case 'checkboxes':
                    return this._pickOption(inp.options, answer, true);
                case 'dropdown':
                    return this._fillDropdown(inp.element, answer);
            }
            return false;
        }

        async _fillText(el, value) {
            el.focus();
            if (el.getAttribute('contenteditable') === 'true') el.textContent = value;
            else U.setNativeValue(el, value);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.blur();
            return true;
        }

        _pickOption(options, answer, multi) {
            if (!options || !options.length) return false;
            const parts = multi ? answer.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean) : [answer];
            let any = false;
            for (const part of parts) {
                let target = null;
                const letter = part.match(/^([A-Z])(?:[\.\)\s,]|$)/i);
                if (letter) {
                    const idx = letter[1].toUpperCase().charCodeAt(0) - 65;
                    if (options[idx]) target = options[idx];
                }
                if (!target) {
                    const norm = U.normalize(part);
                    target = options.find((o) => U.normalize(o.text) === norm);
                    if (!target) target = options.find((o) => {
                        const n = U.normalize(o.text);
                        return n.includes(norm) || norm.includes(n);
                    });
                }
                if (!target) continue;
                const already = target.element.checked === true ||
                                target.element.getAttribute('aria-checked') === 'true' ||
                                target.element.getAttribute('aria-selected') === 'true';
                if (!already) target.element.click();
                any = true;
            }
            return any;
        }

        _fillDropdown(el, answer) {
            const opts = Array.from(el.options || []);
            if (opts.length === 0) return false;
            const norm = U.normalize(answer);
            let opt = opts.find((o) => U.normalize(o.textContent) === norm);
            if (!opt) {
                const m = answer.match(/^([A-Z])(?:[\.\)\s]|$)/i);
                if (m) opt = opts[m[1].toUpperCase().charCodeAt(0) - 65];
            }
            if (!opt) opt = opts.find((o) => {
                const n = U.normalize(o.textContent);
                return n.includes(norm) || norm.includes(n);
            });
            if (opt) {
                el.value = opt.value;
                el.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }
            return false;
        }
    }

    const ADAPTERS = [new QuizizzAdapter(), new GoogleFormsAdapter(), new SemanticAdapter()];
    const aiManager = new AIManager();

    const Solver = {
        busy: false,

        async _augmentWithWebSearch(prompt, query) {
            const cfg = aiManager.cfg;
            if (!cfg.webSearch) {
                LOG.add('[Search] ⚠ web search OFF');
                return prompt;
            }
            const cleanQ = U.cleanQuery(query);
            if (!cleanQ || cleanQ.length < 3) return prompt;
            try {
                const results = await aiManager.webSearch(cleanQ);
                if (!results.length) return prompt;
                results.slice(0, 3).forEach((r, i) => {
                    LOG.add(`[Search] #${i + 1}: ${r.title.slice(0, 80)}`);
                    LOG.add(`[Search]    ${r.content.slice(0, 140)}`);
                });
                const context = results.map((r, i) =>
                    `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content}`
                ).join('\n\n');
                return `=== KONTEKS DARI WEB (WAJIB gunakan sebagai fakta utama; abaikan pengetahuan internal jika bertentangan) ===\n${context}\n=== AKHIR KONTEKS ===\n\n${prompt}`;
            } catch (e) {
                LOG.add(`[Search] ⚠ Error: ${e.message}`);
                return prompt;
            }
        },

        async solveCurrent() {
            if (this.busy) return;
            this.busy = true;
            LOG.clear();
            LOG.add(`Model: ${aiManager.cfg.model} | Temp: ${aiManager.cfg.temperature}`);
            LOG.add(`Web Search: ${aiManager.cfg.webSearch ? 'ON (' + aiManager.cfg.webSearchEngine + ')' : 'OFF'}`);

            const btn = document.getElementById('ai-solver-button');
            if (btn) { btn.disabled = true; btn.textContent = '⏳ Berpikir...'; }

            try {
                const candidates = ADAPTERS.filter((a) => {
                    try { return a.matches(location.href); } catch { return false; }
                });
                if (candidates.length === 0) throw new Error('Tidak ada adapter untuk URL ini.');

                let adapter = null, payload = null;
                for (const a of candidates) {
                    try {
                        payload = await a.extract();
                        adapter = a;
                        LOG.add(`Adapter: ${a.constructor.name}`);
                        break;
                    } catch (e) {
                        LOG.add(`Adapter ${a.constructor.name} gagal: ${e.message}`);
                    }
                }
                if (!adapter) throw new Error('Semua adapter gagal.');

                if (payload.type === 'dropdown') {
                    payload.dropdownButton.click();
                    try {
                        const nodes = await U.waitFor('.v-popper__popper--shown button.dropdown-option', { all: true, timeout: 3000 });
                        payload.options = Array.from(nodes).map((el) => ({ text: U.text(el), element: el }));
                        const { prompt } = adapter.buildPrompt(payload);
                        const augmented = await this._augmentWithWebSearch(prompt, payload.questionText);
                        const answer = await aiManager.solve({ prompt: augmented });
                        LOG.add(`AI: "${answer.trim()}"`);
                        const match = Array.from(nodes).find((el) => U.text(el) === answer.trim().replace(/["'`]/g, ''));
                        if (match) match.click();
                        else U.dismissPopper();
                    } catch (e) {
                        U.dismissPopper();
                        throw e;
                    }
                    return;
                }

                if (payload.type === 'google_form') {
                    const total = payload.questions.length;
                    for (let i = 0; i < total; i++) {
                        const item = payload.questions[i];
                        if (btn) btn.textContent = `⏳ Soal ${i + 1}/${total}`;
                        LOG.add(`─── SOAL ${i + 1}/${total}: ${item.question.slice(0, 60)}`);
                        try {
                            const { prompt } = adapter.buildSinglePrompt(item, i, total);
                            const augmented = await this._augmentWithWebSearch(prompt, item.question);
                            const answer = await aiManager.solve({ prompt: augmented });
                            LOG.add(`→ ${answer.trim()}`);
                            await adapter.applySingle(answer, item);
                        } catch (e) {
                            LOG.add(`✗ Gagal: ${e.message}`);
                        }
                        await U.sleep(300);
                    }
                    return;
                }

                if (payload.type === 'semantic') {
                    const total = payload.inputs.length;
                    for (let i = 0; i < total; i++) {
                        const inp = payload.inputs[i];
                        if (btn) btn.textContent = `⏳ Field ${i + 1}/${total}`;
                        LOG.add(`─── FIELD ${i + 1}/${total}: ${(inp.question || '').slice(0, 60)}`);
                        try {
                            const { prompt } = adapter.buildSinglePrompt(inp, i, total, payload);
                            const augmented = await this._augmentWithWebSearch(prompt, inp.question);
                            const answer = await aiManager.solve({ prompt: augmented });
                            LOG.add(`→ ${answer.trim()}`);
                            await adapter.applySingle(answer, inp);
                        } catch (e) {
                            LOG.add(`✗ Gagal: ${e.message}`);
                        }
                        await U.sleep(300);
                    }
                    return;
                }

                const { prompt } = adapter.buildPrompt(payload);
                let image = null;
                if (payload.questionImageUrl) {
                    const dataUrl = await U.urlToBase64(payload.questionImageUrl);
                    if (dataUrl) {
                        const [hdr, b64] = dataUrl.split(',');
                        image = { mime: hdr.match(/:(.*?);/)?.[1] || 'image/jpeg', data: b64 };
                    }
                }
                const augmented = await this._augmentWithWebSearch(prompt, payload.questionText);
                LOG.add(`Kirim ke AI (${augmented.length} char)`);
                const answer = await aiManager.solve({ prompt: augmented, image });
                LOG.add(`AI: "${answer.trim()}"`);
                await adapter.apply(answer, payload);
            } catch (e) {
                LOG.add(`✗ ERROR: ${e.message}`);
                throw e;
            } finally {
                this.busy = false;
                if (btn) { btn.disabled = false; btn.textContent = '✨ Selesaikan'; }
            }
        },
    };

    const UI = {
        panel: null,

        mount() {
            if (document.getElementById('scolver-panel')) return;

            const panel = document.createElement('div');
            panel.id = 'scolver-panel';
            Object.assign(panel.style, {
                position: 'fixed', bottom: '60px', right: '20px', zIndex: '2147483647',
                display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px',
                background: 'rgba(26,27,30,0.85)', backdropFilter: 'blur(10px)',
                borderRadius: '14px', boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
                fontFamily: 'system-ui, sans-serif', opacity: '0',
                transition: 'opacity 0.3s ease', maxWidth: 'min(400px, 90vw)',
            });

            const header = document.createElement('div');
            header.style.cssText = 'font-size:11px;color:rgba(255,255,255,0.6);cursor:grab;text-align:center;';
            header.textContent = 'Universal Solver v68';
            panel.appendChild(header);

            const providerBadge = document.createElement('div');
            providerBadge.style.cssText = 'font-size:10px;color:#a78bfa;text-align:center;';
            const updateProvider = () => { providerBadge.textContent = `AI: ${aiManager.activeLabel}`; };
            updateProvider();
            panel.appendChild(providerBadge);

            const settingsBtn = document.createElement('button');
            settingsBtn.textContent = '⚙ Pengaturan AI';
            Object.assign(settingsBtn.style, {
                background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)',
                color: 'rgba(255,255,255,0.85)', cursor: 'pointer', fontSize: '11px',
                padding: '6px 8px', borderRadius: '6px',
            });
            panel.appendChild(settingsBtn);

            const settings = document.createElement('div');
            Object.assign(settings.style, {
                display: 'none', flexDirection: 'column', gap: '6px',
                padding: '8px', background: 'rgba(10,10,15,0.96)', borderRadius: '8px',
                maxHeight: '65vh', overflowY: 'auto',
            });

            const fields = [
                ['label', 'Nama AI', 'text'],
                ['baseUrl', 'Base URL', 'url'],
                ['endpoint', 'Endpoint', 'text'],
                ['apiKey', 'API Key', 'password'],
                ['model', 'Model', 'text'],
                ['temperature', 'Temperature (0-2)', 'number', '0.1'],
                ['topP', 'Top P', 'number', '0.05'],
                ['topK', 'Top K', 'number'],
                ['repeatPenalty', 'Repeat Penalty', 'number', '0.05'],
                ['numCtx', 'Num Ctx', 'number'],
                ['numPredict', 'Num Predict', 'number'],
            ];
            const controls = {};
            fields.forEach(([key, label, type, step]) => {
                const wrap = document.createElement('label');
                wrap.textContent = label;
                wrap.style.cssText = 'display:flex;flex-direction:column;gap:3px;color:#ddd;font-size:10px;';
                const input = document.createElement('input');
                input.type = type;
                input.value = aiManager.cfg[key] ?? '';
                input.autocomplete = 'off';
                input.spellcheck = false;
                if (step) input.step = step;
                input.style.cssText = 'box-sizing:border-box;width:100%;padding:7px;border:1px solid #444;border-radius:5px;background:#191a20;color:#fff;font-size:11px;';
                controls[key] = input;
                wrap.appendChild(input);
                settings.appendChild(wrap);
            });

            const visionWrap = document.createElement('label');
            visionWrap.style.cssText = 'display:flex;align-items:center;gap:6px;color:#ddd;font-size:11px;';
            const visionInput = document.createElement('input');
            visionInput.type = 'checkbox';
            visionInput.checked = !!aiManager.cfg.vision;
            visionWrap.append(visionInput, document.createTextNode('Model mendukung gambar'));
            settings.appendChild(visionWrap);

            const webWrap = document.createElement('label');
            webWrap.style.cssText = 'display:flex;align-items:center;gap:6px;color:#ddd;font-size:11px;';
            const webInput = document.createElement('input');
            webInput.type = 'checkbox';
            webInput.checked = !!aiManager.cfg.webSearch;
            webWrap.append(webInput, document.createTextNode('Aktifkan Web Search'));
            settings.appendChild(webWrap);

            const engineWrap = document.createElement('label');
            engineWrap.textContent = 'Search Engine';
            engineWrap.style.cssText = 'display:flex;flex-direction:column;gap:3px;color:#ddd;font-size:10px;';
            const engineSelect = document.createElement('select');
            [['auto', 'Auto (DDG Lite → Bing → DDG HTML)'], ['ddglite', 'DuckDuckGo Lite'], ['bing', 'Bing'], ['ddghtml', 'DuckDuckGo HTML']].forEach(([v, t]) => {
                const o = document.createElement('option');
                o.value = v;
                o.textContent = t;
                if ((aiManager.cfg.webSearchEngine || 'auto') === v) o.selected = true;
                engineSelect.appendChild(o);
            });
            engineSelect.style.cssText = 'box-sizing:border-box;width:100%;padding:7px;border:1px solid #444;border-radius:5px;background:#191a20;color:#fff;font-size:11px;';
            engineWrap.appendChild(engineSelect);
            settings.appendChild(engineWrap);

            const webMaxWrap = document.createElement('label');
            webMaxWrap.textContent = 'Max Results (1-10)';
            webMaxWrap.style.cssText = 'display:flex;flex-direction:column;gap:3px;color:#ddd;font-size:10px;';
            const webMaxInput = document.createElement('input');
            webMaxInput.type = 'number';
            webMaxInput.min = '1';
            webMaxInput.max = '10';
            webMaxInput.value = aiManager.cfg.webSearchMaxResults ?? 4;
            webMaxInput.style.cssText = 'box-sizing:border-box;width:100%;padding:7px;border:1px solid #444;border-radius:5px;background:#191a20;color:#fff;font-size:11px;';
            webMaxWrap.appendChild(webMaxInput);
            settings.appendChild(webMaxWrap);

            const saveBtn = document.createElement('button');
            saveBtn.textContent = 'Simpan konfigurasi';
            saveBtn.style.cssText = 'padding:8px;border:0;border-radius:6px;background:#7c3aed;color:#fff;font-size:11px;cursor:pointer;';
            saveBtn.onclick = () => {
                const next = Object.fromEntries(Object.entries(controls).map(([key, input]) => [key, input.value.trim()]));
                next.vision = visionInput.checked;
                next.webSearch = webInput.checked;
                next.webSearchEngine = engineSelect.value;
                next.webSearchMaxResults = Number(webMaxInput.value) || 4;
                try {
                    aiManager.update(next);
                    updateProvider();
                    settings.style.display = 'none';
                    settingsBtn.textContent = '⚙ Pengaturan AI';
                } catch (e) { alert('Gagal: ' + e.message); }
            };
            settings.appendChild(saveBtn);
            panel.appendChild(settings);
            settingsBtn.onclick = () => {
                const open = settings.style.display === 'flex';
                settings.style.display = open ? 'none' : 'flex';
                settingsBtn.textContent = open ? '⚙ Pengaturan AI' : '✕ Tutup pengaturan';
            };

            const viewer = document.createElement('div');
            viewer.id = 'ai-response-viewer';
            Object.assign(viewer.style, {
                display: 'block', maxHeight: '260px', overflowY: 'auto',
                background: 'rgba(10,10,15,0.9)', borderRadius: '8px',
                padding: '8px', color: '#a3e635', fontSize: '10px',
                fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                border: '1px solid rgba(255,255,255,0.1)',
            });
            viewer.textContent = '(log akan muncul di sini)';
            panel.appendChild(viewer);

            const clearBtn = document.createElement('button');
            clearBtn.textContent = 'Hapus log';
            Object.assign(clearBtn.style, {
                background: 'none', border: '1px solid rgba(255,255,255,0.2)',
                color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: '10px',
                padding: '3px 6px', borderRadius: '5px',
            });
            clearBtn.onclick = () => LOG.clear();
            panel.appendChild(clearBtn);

            const solveBtn = document.createElement('button');
            solveBtn.id = 'ai-solver-button';
            solveBtn.textContent = '✨ Selesaikan';
            Object.assign(solveBtn.style, {
                background: 'linear-gradient(135deg, #a78bfa, #8b5cf6)',
                border: 'none', borderRadius: '10px', color: 'white',
                cursor: 'pointer', fontSize: '14px', fontWeight: '600',
                padding: '10px 20px', boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
            });
            solveBtn.onclick = () => Solver.solveCurrent().catch((e) => {
                console.error(e);
                alert('Error: ' + e.message);
            });
            panel.appendChild(solveBtn);

            const footer = document.createElement('div');
            footer.style.cssText = 'font-size:10px;color:rgba(255,255,255,0.4);text-align:right;';
            footer.textContent = '@PerfectKaa · universal';
            panel.appendChild(footer);

            this._enableDrag(panel, header);
            document.body.appendChild(panel);
            this.panel = panel;
            requestAnimationFrame(() => { panel.style.opacity = '1'; });
        },

        _enableDrag(panel, handle) {
            let dx = 0, dy = 0, dragging = false;
            handle.addEventListener('mousedown', (e) => {
                if (e.target.tagName === 'BUTTON') return;
                dragging = true;
                const r = panel.getBoundingClientRect();
                panel.style.right = 'auto'; panel.style.bottom = 'auto';
                panel.style.top = r.top + 'px'; panel.style.left = r.left + 'px';
                dx = e.clientX - r.left; dy = e.clientY - r.top;
                handle.style.cursor = 'grabbing';
                e.preventDefault();
            });
            document.addEventListener('mousemove', (e) => {
                if (!dragging) return;
                const x = Math.max(0, Math.min(e.clientX - dx, innerWidth - panel.offsetWidth));
                const y = Math.max(0, Math.min(e.clientY - dy, innerHeight - panel.offsetHeight));
                panel.style.top = y + 'px'; panel.style.left = x + 'px';
            });
            document.addEventListener('mouseup', () => { dragging = false; handle.style.cursor = 'grab'; });
        },
    };

    (async function init() {
        await new Promise((r) => (document.body ? r() : document.addEventListener('DOMContentLoaded', r, { once: true })));
        UI.mount();
        const matched = ADAPTERS.find((a) => { try { return a.matches(location.href); } catch { return false; } });
        LOG.add(`[Init] Adapter: ${matched?.constructor.name || 'tidak ada'}`);
    })();
})();

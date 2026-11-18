"""Browser checks for guided-evidence-explanations (spec R1, R4, R5, R8).

Starts a test backend (own SQLite file in a temp folder) and `next start` on free ports, then drives
Edge or Chromium at 320, 375 and 1280 px. No real key, no network call to Google (Gemini is route-mocked).
Run `next build` first. Set AFTERLIFE_BROWSER_CHANNEL=msedge to use Edge. Set AFTERLIFE_SHOTS to save screenshots.
"""
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import httpx
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[2]
axe_path = Path(os.environ.get('AFTERLIFE_AXE', r'C:\mysite\.audit-tools\node_modules\axe-core\axe.min.js'))
shots = Path(os.environ['AFTERLIFE_SHOTS']) if os.environ.get('AFTERLIFE_SHOTS') else None
tmp = Path(tempfile.mkdtemp(prefix='afterlife-guided-'))


def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]


# "next start" serves the rewrite target chosen at build time (default http://127.0.0.1:8000), so the test backend uses 8000.
bp, fp = int(os.environ.get('AFTERLIFE_TEST_BACKEND_PORT', '8000')), free_port()
env = dict(os.environ, PYTHONPATH=str(root), API_ORIGIN=f'http://127.0.0.1:{bp}', AFTERLIFE_DB_PATH=str(tmp / 'audit.db'),
           AFTERLIFE_AUTH_MODE='local', NEXT_TELEMETRY_DISABLED='1')
for name in ('GEMINI_LIVE_ENABLED', 'GEMINI_API_KEY', 'GEMINI_ACCESS_CODE'):
    env.pop(name, None)
backend = subprocess.Popen([sys.executable, '-m', 'uvicorn', 'backend.main:app', '--host', '127.0.0.1', '--port', str(bp)],
                           cwd=root, env=env, stdout=open(tmp / 'backend.log', 'w'), stderr=subprocess.STDOUT)
frontend = subprocess.Popen(['node', str(root / 'frontend/node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', str(fp)],
                            cwd=root / 'frontend', env=env, stdout=open(tmp / 'frontend.log', 'w'), stderr=subprocess.STDOUT)
base = f'http://127.0.0.1:{fp}'
failures = []


def check(name, condition, detail=''):
    print(('PASS ' if condition else 'FAIL ') + name + (f' | {detail}' if detail and not condition else ''), flush=True)
    if not condition:
        failures.append(name)


def stop():
    for proc in (frontend, backend):
        subprocess.run(['taskkill', '/PID', str(proc.pid), '/T', '/F'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def start_run(page, mode, previous=''):
    """Start a run in the current Attack Lab visit and return its run ID once the run is COMPLETE."""
    page.get_by_role('button', name='Defended' if mode == 'defended' else 'Undefended', exact=True).click()
    page.get_by_role('button', name='Start simulation').click()
    page.wait_for_function("""(prev) => { const id = document.querySelector('[data-testid=run-id]');
        return id && id.textContent !== prev && document.body.innerText.includes('Status: COMPLETE'); }""", arg=previous, timeout=20000)
    return page.get_by_test_id('run-id').inner_text()


def open_lab(page, scenario_index):
    page.goto(base + '/attack-lab', wait_until='networkidle')
    page.get_by_label('Select scenario').select_option(index=scenario_index)


def axe(page, label):
    if not axe_path.exists():
        check(f'axe available ({label})', False, 'axe-core not found')
        return
    page.add_script_tag(path=str(axe_path))
    result = page.evaluate('axe.run(document, {runOnly: ["wcag2a","wcag2aa","wcag21aa","best-practice"]}).then(r => r.violations.map(v => v.id + ": " + v.nodes.map(n => n.target.join(" ")).slice(0,3).join(" | ")))')
    check(f'axe: no violations ({label})', not result, '; '.join(result))


def no_overflow(page, width, label):
    scroll = page.evaluate('document.documentElement.scrollWidth')
    check(f'no page-level horizontal scroll ({label})', scroll <= width, f'scrollWidth={scroll}')


def shot(page, name):
    if shots:
        shots.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(shots / f'{name}.png'), full_page=True)


def focus_by_tab(page, predicate_js, limit=80):
    for _ in range(limit):
        page.keyboard.press('Tab')
        if page.evaluate(predicate_js):
            return True
    return False


def app_alert(page):
    return page.locator('[role="alert"]:not(#__next-route-announcer__)')


def api(path):
    return httpx.get(f'http://127.0.0.1:{bp}{path}', timeout=10).json()


try:
    for _ in range(300):
        try:
            if httpx.get(base + '/api/scenarios', timeout=1).status_code == 200:
                break
        except httpx.HTTPError:
            pass
        time.sleep(.2)
    else:
        raise AssertionError('servers did not start (did you run next build?). Logs: ' + str(tmp))

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'], channel=os.environ.get('AFTERLIFE_BROWSER_CHANNEL') or None)
        for width in (320, 375, 1280):
            tag = f'{width}px'
            context = browser.new_context(viewport={'width': width, 'height': 900}, reduced_motion='reduce')
            context.grant_permissions(['clipboard-read', 'clipboard-write'], origin=base)
            page = context.new_page()
            narrow = width <= 375

            # ---- Attack Lab, scenario 01 (index 0): copy, evidence link, compare link ----
            open_lab(page, 0)
            undefended = start_run(page, 'undefended')
            check(f'run ID shown and copyable ({tag})', len(undefended) == 36)
            page.get_by_role('button', name='Copy run ID').click()
            page.get_by_text('Run ID copied.').wait_for(timeout=3000)
            check(f'clipboard holds the run ID ({tag})', page.evaluate('navigator.clipboard.readText()') == undefended)
            check(f'no Compare link before both runs exist ({tag})', page.get_by_role('link', name='Compare undefended and defended runs').count() == 0)
            defended = start_run(page, 'defended', undefended)
            check(f'run IDs differ ({tag})', defended != undefended)
            page.get_by_text('Key policy decision: mock_data_exfiltrate').first.wait_for()

            # reading order: status and run ID, then result, then timeline, then graph
            order = page.evaluate('''() => ["Run ID","Result","Event timeline","Event graph"].map(t => { const h = [...document.querySelectorAll("h2")].find(e => e.textContent.trim() === t); return h ? h.getBoundingClientRect().top + scrollY : -1; })''')
            check(f'reading order run ID < result < timeline < graph ({tag})', all(v >= 0 for v in order) and order == sorted(order), str(order))
            check(f'graph block is a named section ({tag})', page.locator('section[aria-labelledby="graph-title"]').count() == 1)
            shot(page, f'attack-lab-result-{width}')
            no_overflow(page, width, f'attack lab {tag}')
            axe(page, f'attack lab {tag}')

            evidence_link = page.get_by_role('link', name='Open in Evidence')
            check(f'evidence link carries the run ID ({tag})', defended in (evidence_link.get_attribute('href') or ''))
            compare_link = page.get_by_role('link', name='Compare undefended and defended runs')
            href = compare_link.get_attribute('href') or ''
            check(f'compare link carries both IDs ({tag})', f'run_a={undefended}' in href and f'run_b={defended}' in href, href)

            # ---- Time Machine, scenario 01 ----
            compare_link.click()
            page.get_by_role('heading', name='First event difference: step #3').wait_for(timeout=10000)
            text = page.locator('main').inner_text()
            api_compare = api(f'/api/compare?run_a={undefended}&run_b={defended}')
            key_b = api_compare['key_decision_b']
            check(f'scenario 01 first difference names INJECTION_DETECTED ({tag})', 'INJECTION_DETECTED' in text and api_compare['divergence_event_b']['event_type'] == 'INJECTION_DETECTED')
            check(f'scenario 01 first difference is not the key decision ({tag})', 'comes earlier than the key decision' in page.get_by_test_id('key-relation').inner_text())
            cards = page.get_by_test_id('decision-card')
            card_b = cards.nth(1).inner_text()
            check(f'key decision card shows tool, reason, policy, trust from the audit event ({tag})',
                  all(s in card_b for s in ('mock_data_exfiltrate', 'Denied', key_b['policy_reason_code'], key_b['policy_id'], '1 (user)', f"sequence {key_b['sequence_number']}")), card_b)
            card_a = cards.nth(0).inner_text()
            check(f'undefended key decision shows allowed ({tag})', 'Allowed' in card_a and api_compare['key_decision_a']['policy_reason_code'] in card_a, card_a)
            check(f'no invented flags ({tag})', 'IMPERATIVE_VERB' not in text and 'KNOWN_INJECTION_PATTERN' not in text)
            hint = page.get_by_test_id('scroll-hint')
            if narrow:
                check(f'table scroll hint visible ({tag})', hint.count() == 1 and hint.is_visible())
            else:
                check(f'no scroll hint when the table fits ({tag})', hint.count() == 0)
            region = page.get_by_role('region', name='Run comparison, all aligned events')
            check(f'table region reachable by keyboard and scrolls ({tag})', focus_by_tab(page, 'document.activeElement?.getAttribute("aria-label") === "Run comparison, all aligned events"'))
            outline = page.evaluate('getComputedStyle(document.activeElement).outlineStyle')
            check(f'focus indicator on table region ({tag})', outline != 'none', outline)
            if narrow:
                page.keyboard.press('ArrowRight')
                page.wait_for_timeout(100)
                check(f'arrow key scrolls the table sideways ({tag})', region.evaluate('e => e.scrollLeft') > 0)
            shot(page, f'time-machine-s1-{width}')
            no_overflow(page, width, f'time machine s1 {tag}')
            axe(page, f'time machine s1 {tag}')

            # ---- Evidence from the key IDs ----
            page.goto(f'{base}/evidence?run_id={defended}', wait_until='networkidle')
            page.get_by_role('heading', name='Key policy decision: mock_data_exfiltrate').wait_for(timeout=10000)
            report = api(f'/api/report/{defended}')
            key = report['key_decision']
            ev_text = page.locator('main').inner_text()
            check(f'evidence key decision equals the audit event ({tag})', all(s in ev_text for s in (key['policy_reason_code'], key['policy_id'], f"sequence {key['sequence_number']}", '1 (user)')))
            check(f'evidence marks the key row ({tag})', page.locator('tr.row-first').count() == 1)
            shot(page, f'evidence-{width}')
            no_overflow(page, width, f'evidence {tag}')
            axe(page, f'evidence {tag}')
            if narrow:
                check(f'evidence table scroll hint ({tag})', page.get_by_test_id('scroll-hint').is_visible())

            # ---- scenario 02 (index 1): first difference IS the key decision ----
            open_lab(page, 1)
            ids = {'undefended': start_run(page, 'undefended')}
            ids['defended'] = start_run(page, 'defended', ids['undefended'])
            page.get_by_role('link', name='Compare undefended and defended runs').click()
            page.get_by_role('heading', name='First event difference: step #4').wait_for(timeout=10000)
            check(f'scenario 02 first difference is the key decision ({tag})', page.get_by_test_id('key-relation').inner_text().strip() == 'The first event difference is the key decision.')
            api_compare = api(f'/api/compare?run_a={ids["undefended"]}&run_b={ids["defended"]}')
            card_b = page.get_by_test_id('decision-card').nth(1).inner_text()
            check(f'scenario 02 denial reason and trust level shown ({tag})',
                  api_compare['key_decision_b']['policy_reason_code'] == 'TRUST_LEVEL_INSUFFICIENT' and 'TRUST_LEVEL_INSUFFICIENT' in card_b and '1 (user)' in card_b and 'need trust level 2' in card_b, card_b)
            read_row = api(f'/api/run/{ids["defended"]}/events')['events'][1]
            check(f'scenario 02 read is allowed in the defended audit log ({tag})', read_row['tool_name'] == 'mock_read_config' and read_row['event_type'] == 'TOOL_CALL_EXECUTED')
            shot(page, f'time-machine-s2-{width}')
            no_overflow(page, width, f'time machine s2 {tag}')

            # ---- friendly errors, no internals ----
            page.goto(base + '/evidence', wait_until='networkidle')
            page.get_by_label('Run ID').fill('does-not-exist')
            page.get_by_role('button', name='Fetch').click()
            alert = app_alert(page).first
            alert.wait_for()
            msg = alert.inner_text()
            check(f'evidence 404 message has no URL or JSON ({tag})', 'No run was found' in msg and '/api' not in msg and '{' not in msg and 'detail' not in msg.lower(), msg)
            page.goto(base + '/time-machine', wait_until='networkidle')
            page.get_by_label('Run A (e.g. undefended)').fill(ids['undefended'])
            page.get_by_label('Run B (e.g. defended)').fill(ids['undefended'])
            page.get_by_role('button', name='Compare').click()
            alert = app_alert(page).first
            alert.wait_for()
            msg = alert.inner_text()
            check(f'compare 400 message explains what to do ({tag})', 'cannot be compared' in msg and '/api' not in msg and '{' not in msg, msg)

            # ---- Playground: blank input clears the old result ----
            page.goto(base + '/playground', wait_until='networkidle')
            page.get_by_role('button', name='Run simulation').click()
            page.locator('.experiment-result').wait_for()
            page.get_by_label('Untrusted tool output').fill('   ')
            page.get_by_role('button', name='Run simulation').click()
            app_alert(page).wait_for()
            check(f'blank input removes the previous result ({tag})', page.locator('.experiment-result').count() == 0)
            check(f'blank input shows a plain error ({tag})', 'visible character' in app_alert(page).inner_text())
            page.get_by_label('Untrusted tool output').fill('new text')
            page.get_by_role('button', name='Run simulation').click()
            page.locator('.experiment-result').wait_for()
            check(f'error clears on the next valid run ({tag})', app_alert(page).count() == 0)
            page.get_by_role('radio', name='Gemini live').click()
            check(f'Astryx mode selector still works by keyboard ({tag})', page.get_by_role('radio', name='Simulated boundary').count() == 1 and page.get_by_role('radio', name='Gemini live').is_checked())
            axe(page, f'playground {tag}')
            no_overflow(page, width, f'playground {tag}')
            shot(page, f'playground-{width}')

            # ---- home: named group semantics ----
            page.goto(base + '/', wait_until='networkidle')
            bad = page.evaluate('''() => [...document.querySelectorAll("[aria-label],[aria-labelledby]")].filter(e => {
                const generic = ["DIV","SPAN","P"].includes(e.tagName) && !e.getAttribute("role"); return generic; }).map(e => e.tagName + "." + e.className)''')
            check(f'no aria-label on role-less div, span or p on the home page ({tag})', not bad, str(bad))
            check(f'flow block is a named region ({tag})', page.get_by_role('region', name='Guided experiment').count() == 1)
            context.close()

        # ---- Gemini result with a truncated reply (mocked transport; no network) ----
        context = browser.new_context(viewport={'width': 375, 'height': 900})
        page = context.new_page()
        body = {'mode': 'gemini', 'model': 'mock-model', 'output': 'a' * 20, 'output_truncated': True, 'output_chars_total': 9000,
                'task': {'scenario_id': None, 'instruction': 'Summarize.', 'input_source': 'text you typed (untrusted)', 'input_handling': 'No real tools.'},
                'observation': {'status': 'not_observed', 'summary': 'None of the checked behaviors appeared in the shown reply. The reply has 8980 more characters that were not shown and not checked.',
                                'criteria': [], 'test_record': 'CANARY-TEST', 'proposed_actions': [], 'policy_view': [], 'limits': 'Two fixed text checks on one reply.',
                                'scope': {'chars_checked': 20, 'chars_total': 9000, 'truncated': True}},
                'notice': 'Model output is untrusted.'}
        sent = []
        context.route('**/api/evaluate/gemini/status', lambda route: route.fulfill(status=200, content_type='application/json', body='{"enabled": true}'))
        def mock_post(route):
            if route.request.method == 'POST':
                sent.append(json.loads(route.request.post_data))
                route.fulfill(status=200, content_type='application/json', body=json.dumps(body))
            else:
                route.continue_()
        context.route('**/api/evaluate/gemini', mock_post)
        page.goto(base + '/playground', wait_until='networkidle')
        page.get_by_role('radio', name='Gemini live').click()
        page.get_by_label('Text to send to Gemini').fill('hello')
        page.get_by_label('Access code (given by the operator)').fill('code-for-mock-only')
        page.get_by_label('I understand that the text above').check()
        page.get_by_role('button', name='Request Gemini response').click()
        page.get_by_test_id('output-truncated').wait_for()
        shown = page.locator('.experiment-result').inner_text()
        check('truncation notice shows shown and total characters', 'first 20 of 9000 characters' in shown)
        check('scope line matches the displayed text', 'Checked 20 of 9000 characters' in page.get_by_test_id('observation-scope').inner_text())
        check('not-observed is not presented as defense success', 'does not show a defense worked' in page.get_by_test_id('observation-status').inner_text() and 'DEFENDED' not in shown)
        check('model reply, text checks and policy view are separate sections', all(h in shown for h in ('3. Model response', '4. Fixed text checks, not a verdict', '5. Policy view')))
        check('request carries the consent flag from the checkbox', sent and sent[0].get('external_send_consent') is True and sent[0].get('text') == 'hello', str(sent))
        axe(page, 'playground gemini result 375px')
        shot(page, 'playground-gemini-truncated-375')
        context.close()
        browser.close()
finally:
    stop()

print('FAILURES: ' + (', '.join(failures) if failures else 'none'))
sys.exit(1 if failures else 0)

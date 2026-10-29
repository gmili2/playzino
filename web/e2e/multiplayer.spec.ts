import { expect, test, type Page } from '@playwright/test';

const uid = () => Math.random().toString(36).slice(2, 8);
const shots = process.env.E2E_SHOTS;

async function register(page: Page, name: string) {
  await page.goto('/register');
  await page.locator('input[name=email]').fill(`${name}@e2e.local`);
  await page.locator('input[name=username]').fill(name);
  await page.locator('input[name=password]').fill('motdepasse-123');
  await page.locator('input[name=confirm]').fill('motdepasse-123');
  await page.getByRole('button', { name: 'إنشاء الحساب' }).click();
  await expect(page.getByTestId('user-chip')).toContainText(name);
  await expect(page.getByTestId('balance')).toContainText('1,000');
}

/** Solde lu via l'API avec la session du navigateur. */
async function balanceOf(page: Page) {
  const r = await page.request.get('/api/me');
  return (await r.json()).user.balance as number;
}

/** Joue le tour si c'est au joueur de cette page ; renvoie true si une action a été faite. */
async function playIfMyTurn(page: Page): Promise<boolean> {
  const roll = page.getByTestId('roll');
  if (await roll.isEnabled()) {
    await roll.click();
    await expect(roll).not.toHaveText('جارٍ الرمي…');
    return true;
  }
  const movable = page.locator('button[data-testid^="pawn-"]:not([disabled])');
  if (await movable.count()) {
    await movable.first().click();
    return true;
  }
  return false;
}

test('deux navigateurs : table privée, synchronisation temps réel, abandon et gains', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const nameA = 'alice' + uid();
  const nameB = 'bob' + uid();
  await register(a, nameA);
  await register(b, nameB);
  if (shots) await a.screenshot({ path: `${shots}/home.png`, fullPage: true });

  // A crée une table privée avec mise de 100.
  await a.goto('/tables');
  await a.locator('#create input').first().fill('Table E2E');
  await a.locator('#create').getByRole('button', { name: '100', exact: true }).nth(1).click();
  await a.getByRole('button', { name: 'أنشئ الطاولة' }).click();
  await expect(a.getByTestId('waiting-overlay')).toBeVisible();
  const code = (await a.getByTestId('room-code').textContent())!.trim();
  expect(code).toMatch(/^PRC-[A-Z2-9]{4}$/);
  expect(await balanceOf(a)).toBe(900);
  if (shots) await a.screenshot({ path: `${shots}/waiting.png` });

  // B rejoint avec le code depuis l'accueil.
  await b.goto('/');
  await b.locator('#lobby-code').fill(code);
  await b.getByRole('button', { name: 'انضم', exact: true }).first().click();
  await expect(b).toHaveURL(/\/room\//);

  // Les deux voient la partie démarrer en temps réel.
  await expect(a.getByTestId('waiting-overlay')).toBeHidden();
  await expect(a.getByTestId('panel-opp')).toContainText(nameB);
  await expect(b.getByTestId('panel-opp')).toContainText(nameA);
  expect(await balanceOf(b)).toBe(900);

  // Une vingtaine d'actions jouées par clics ; chaque coup doit apparaître chez l'adversaire.
  let actions = 0;
  for (let i = 0; i < 200 && actions < 20; i++) {
    const acted = (await playIfMyTurn(a)) || (await playIfMyTurn(b));
    if (acted) {
      actions++;
      await expect.poll(async () => (await a.getByTestId('die-value').textContent()) === (await b.getByTestId('die-value').textContent())).toBe(true);
    } else {
      await a.waitForTimeout(150);
    }
  }
  expect(actions).toBeGreaterThanOrEqual(20);
  await expect(a.getByTestId('game-log').locator('li')).not.toHaveCount(0);
  if (shots) {
    await a.screenshot({ path: `${shots}/game-a.png` });
    await b.screenshot({ path: `${shots}/game-b.png` });
  }

  // Reconnexion : B recharge la page et retrouve exactement la même partie.
  const dieBefore = await a.getByTestId('die-value').textContent();
  await b.reload();
  await expect(b.getByTestId('panel-opp')).toContainText(nameA);
  await expect(b.getByTestId('die-value')).toHaveText(dieBefore!);

  // A abandonne : B gagne la mise totale (200).
  await a.getByRole('button', { name: 'مغادرة' }).click();
  await a.getByTestId('confirm-quit').click();
  await expect(b.getByTestId('result')).toContainText('فوز!');
  await expect(a.getByTestId('result')).toContainText('خسارة');
  await expect.poll(() => balanceOf(b)).toBe(1100);
  expect(await balanceOf(a)).toBe(900);
  if (shots) await b.screenshot({ path: `${shots}/victory.png` });

  // Historique et portefeuille côté profil.
  await b.goto('/profile');
  await expect(b.getByTestId('profile-balance')).toHaveText('1,100');
  await expect(b.getByTestId('history')).toContainText('Table E2E');
  await b.getByRole('tab', { name: 'سجل المحفظة' }).click();
  await expect(b.getByTestId('transactions')).toContainText('فوز في مباراة');
  if (shots) await b.screenshot({ path: `${shots}/profile.png`, fullPage: true });

  // Déconnexion.
  await b.getByTestId('logout').click();
  // Déconnecté : retour sur la page d'accueil vitrine.
  await b.goto('/');
  await expect(b.getByTestId('landing-cta')).toBeVisible();
  await expect(b.getByTestId('user-chip')).toHaveCount(0);
  await ctxA.close();
  await ctxB.close();
});

test('trois navigateurs : table à 3, synchronisation, élimination puis victoire du dernier joueur', async ({ browser }) => {
  const ctxs = await Promise.all([0, 1, 2].map(() => browser.newContext()));
  const pages = await Promise.all(ctxs.map((c) => c.newPage()));
  const names = ['ann' + uid(), 'ben' + uid(), 'cyd' + uid()];
  for (let i = 0; i < 3; i++) await register(pages[i], names[i]);
  const [a, b, c] = pages;

  await a.goto('/tables');
  await a.locator('#create input').first().fill('Table à trois');
  await a.locator('#create').getByRole('button', { name: '3 لاعبين' }).nth(1).click();
  await a.locator('#create').getByRole('button', { name: '50', exact: true }).nth(1).click();
  await a.getByRole('button', { name: 'أنشئ الطاولة' }).click();
  await expect(a.getByTestId('waiting-overlay')).toContainText('1 من 3');
  const code = (await a.getByTestId('room-code').textContent())!.trim();

  for (const p of [b, c]) {
    await p.goto('/');
    await p.locator('#lobby-code').fill(code);
    await p.getByRole('button', { name: 'انضم', exact: true }).first().click();
    await expect(p).toHaveURL(/\/room\//);
  }
  await expect(b.getByTestId('waiting-overlay')).toBeHidden();
  for (const p of pages) {
    await expect(p.getByTestId('waiting-overlay')).toBeHidden();
    await expect(p.getByTestId('panel-opp')).toHaveCount(2);
  }
  if (shots) await a.screenshot({ path: `${shots}/game3-a.png` });

  // Une quinzaine d'actions par clics, synchronisées sur les trois écrans.
  let actions = 0;
  for (let i = 0; i < 300 && actions < 15; i++) {
    let acted = false;
    for (const p of pages) if (!acted) acted = await playIfMyTurn(p);
    if (acted) {
      actions++;
      await expect.poll(async () => new Set(await Promise.all(pages.map((p) => p.getByTestId('die-value').textContent()))).size).toBe(1);
    } else await a.waitForTimeout(150);
  }
  expect(actions).toBeGreaterThanOrEqual(15);

  // A abandonne : il est éliminé, les deux autres continuent.
  await a.getByRole('button', { name: 'مغادرة' }).click();
  await a.getByTestId('confirm-quit').click();
  await expect(a.getByTestId('result')).toContainText('خرجت من المباراة');
  await expect(b.getByTestId('panel-opp').filter({ hasText: names[0] })).toContainText('خرج');
  await expect(b.getByTestId('result')).toHaveCount(0);
  await a.getByRole('button', { name: 'متابعة مشاهدة المباراة' }).click();
  await expect(a.getByTestId('result')).toHaveCount(0);

  // B abandonne à son tour : C, dernier joueur, gagne les 3 mises (1000 - 50 + 150).
  await b.getByRole('button', { name: 'مغادرة' }).click();
  await b.getByTestId('confirm-quit').click();
  await expect(c.getByTestId('result')).toContainText('فوز!');
  await expect.poll(() => balanceOf(c)).toBe(1100);
  expect(await balanceOf(a)).toBe(950);
  expect(await balanceOf(b)).toBe(950);
  if (shots) await c.screenshot({ path: `${shots}/game3-win.png` });
  await Promise.all(ctxs.map((x) => x.close()));
});

import { chromium } from "playwright";
const b = await chromium.launch({ channel:"chrome" });
const ctx = await b.newContext({ viewport:{ width:430, height:900 } });
const p = await ctx.newPage();
await p.goto("http://localhost:5173/",{waitUntil:"networkidle"}); await p.waitForTimeout(1000);
await p.getByRole("button",{name:/sign in/i}).first().click(); await p.waitForTimeout(1000);
for (const rx of [/i agree/i,/accept all/i,/accept/i,/continue/i]) { const l=p.getByRole("button",{name:rx}).first(); if(await l.count()&&await l.isVisible()){await l.click();await p.waitForTimeout(900);break;} }
// seeded account already agent+accepted. open account, deactivate, reactivate.
await p.$(".profilebtn").then(x=>x.click()); await p.waitForTimeout(600);
// become a cleaner row -> already active -> deactivate modal
await p.getByText("Become a cleaner").first().click(); await p.waitForTimeout(500);
const deact = p.getByRole("button",{name:/^Deactivate$/}).first();
if (await deact.count()) { await deact.click(); await p.waitForTimeout(600); }
// reactivate
await p.getByText("Become a cleaner").first().click(); await p.waitForTimeout(500);
const cont = p.getByRole("button",{name:/^Continue$/}).first();
if (await cont.count()) { await cont.click(); await p.waitForTimeout(700); }
// did a consent gate appear? check for "I confirm I have read"
const gate = await p.getByText(/I confirm I have read/i).count();
const activatedNow = await p.locator(".switch.on").count();
console.log("consent gate shown:", gate, "(0=good, skipped)");
await b.close();

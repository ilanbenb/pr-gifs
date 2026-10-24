// Example flow: adding and completing todos in the Playwright TodoMVC demo.
// A flow is a reference shape, not something to record as-is — write a fresh one
// for what the PR changes. The recorder has already signed in, so start at the
// page the PR touches.
//
//   node scripts/record-flow.mjs --flow examples/flow.mjs \
//     --base https://demo.playwright.dev --gif /tmp/todomvc.gif
export default async function flow(page) {
  await page.goto("/todomvc/#/")
  const input = page.getByPlaceholder("What needs to be done?")
  await input.waitFor()
  await page.waitForTimeout(800) // a beat to read where we start

  // Move the pointer before clicking so the synthetic cursor travels to the
  // target instead of teleporting.
  for (const todo of ["Record the flow", "Encode the GIF", "Embed it in the PR"]) {
    await input.click()
    await input.pressSequentially(todo, { delay: 40 })
    await input.press("Enter")
    await page.waitForTimeout(400)
  }
  await page.waitForTimeout(800)

  const first = page.getByTestId("todo-item").first().getByRole("checkbox")
  const box = await first.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 })
  await first.click()
  await page.waitForTimeout(1500) // let the reviewer see it struck through
}

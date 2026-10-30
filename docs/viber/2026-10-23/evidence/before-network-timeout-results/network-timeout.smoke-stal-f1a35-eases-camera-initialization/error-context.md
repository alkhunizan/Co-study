# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: network-timeout.smoke.spec.js >> stalled room runtime configuration settles and releases camera initialization
- Location: tests\smoke\network-timeout.smoke.spec.js:20:1

# Error details

```
Test timeout of 45000ms exceeded.
```

```
Error: locator.click: Test timeout of 45000ms exceeded.
Call log:
  - waiting for locator('#toggle-camera')

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - dialog "Join the focus room" [ref=e2]:
    - generic [ref=e3]:
      - generic "Language selector" [ref=e4]:
        - button "AR" [ref=e5] [cursor=pointer]
        - button "EN" [pressed] [ref=e6] [cursor=pointer]
      - img [ref=e8]
      - heading "Join the focus room" [level=2] [ref=e11]
      - paragraph [ref=e12]: Enter your nickname and room code to start focusing together.
      - generic [ref=e13]: Your nickname
      - textbox "Your nickname" [active] [ref=e14]:
        - /placeholder: Name shown to others
      - generic [ref=e15]: Room code
      - textbox "Room code" [ref=e16]:
        - /placeholder: e.g. ABC123
        - text: 5BRM7L
      - generic [ref=e17]: Room password (if required)
      - textbox "Room password (if required)" [ref=e18]:
        - /placeholder: Leave empty if no password
      - alert [ref=e19]
      - button "Enter room" [ref=e20] [cursor=pointer]
      - link "Choose another room" [ref=e21] [cursor=pointer]:
        - /url: /open
  - banner [ref=e22]:
    - link "Halastudy home" [ref=e23] [cursor=pointer]:
      - /url: /
      - generic [ref=e24]: H
      - generic [ref=e25]:
        - text: Hala
        - emphasis [ref=e26]: study
    - generic [ref=e27]:
      - link "Sign in" [ref=e28] [cursor=pointer]:
        - /url: /account.html
      - generic [ref=e29]:
        - button "AR" [ref=e30] [cursor=pointer]
        - button "EN" [pressed] [ref=e31] [cursor=pointer]
      - button "Toggle theme" [ref=e32] [cursor=pointer]:
        - img [ref=e33]
      - button "Share room link" [ref=e35] [cursor=pointer]:
        - img [ref=e36]
  - generic [ref=e39]:
    - button "Copy room code" [ref=e40] [cursor=pointer]:
      - generic [ref=e41]: Room
      - strong [ref=e42]: "---"
    - generic [ref=e43]:
      - generic [ref=e44]: Media
      - strong [ref=e45]: Study room
    - generic [ref=e46]:
      - generic [ref=e47]: Online
      - strong [ref=e48]: "0"
    - generic [ref=e49]: Waiting for friends to join...
  - main [ref=e50]:
    - group [ref=e51]:
      - generic "Members and shared board" [ref=e52] [cursor=pointer]
      - generic [ref=e53]:
        - generic [ref=e54]:
          - generic [ref=e55]:
            - generic [ref=e56]: Room members
            - generic [ref=e57]: (0)
          - generic [ref=e59]: Waiting for friends to join...
        - generic [ref=e60]:
          - generic [ref=e61]: My status
          - generic [ref=e62]:
            - button "Meal break" [ref=e63] [cursor=pointer]:
              - img [ref=e64]
              - generic [ref=e66]: Meal break
            - button "Away" [ref=e67] [cursor=pointer]:
              - img [ref=e68]
              - generic [ref=e70]: Away
            - button "Studying" [ref=e71] [cursor=pointer]:
              - img [ref=e72]
              - generic [ref=e74]: Studying
            - button "Working" [ref=e75] [cursor=pointer]:
              - img [ref=e76]
              - generic [ref=e79]: Working
          - textbox "Custom status..." [ref=e80]
          - generic [ref=e81]:
            - generic [ref=e82] [cursor=pointer]:
              - checkbox "Sync with timer" [ref=e83]
              - generic [ref=e84]: Sync with timer
            - generic [ref=e85] [cursor=pointer]:
              - checkbox "Share status with room" [checked] [ref=e86]
              - generic [ref=e87]: Share status with room
        - generic [ref=e89]:
          - generic [ref=e90]: Room goal
          - textbox "Room goal" [disabled] [ref=e91]:
            - /placeholder: What is everyone focusing on?
        - generic [ref=e92]:
          - generic [ref=e93]: Shared board
          - generic [ref=e94]: 0/0
        - generic [ref=e95]:
          - textbox "Add shared task..." [disabled] [ref=e96]
          - button "Add shared task" [disabled] [ref=e97]: +
        - generic [ref=e98]:
          - button "High priority" [disabled] [ref=e99]
          - button "Medium priority" [disabled] [ref=e101]
          - button "Low priority" [disabled] [ref=e103]
        - status [ref=e105]
        - generic [ref=e107]: Shared tasks will appear here.
    - generic [ref=e108]:
      - paragraph [ref=e109]: Camera optional. When enabled, people in your room can see it. You can turn it off at any time.
      - generic [ref=e110]:
        - generic:
          - generic: Camera off · study at your pace
        - generic [ref=e112]:
          - button "Enable camera" [ref=e113] [cursor=pointer]
          - 'button "Blur: on" [pressed] [ref=e114] [cursor=pointer]'
      - generic [ref=e115]:
        - heading "Room for focus" [level=1] [ref=e116]
        - status [ref=e117]: Connecting to your room.
        - generic [ref=e118]:
          - generic [ref=e119]: Session goal
          - textbox "Session goal" [ref=e120]:
            - /placeholder: What are you working on?
        - generic [ref=e121]:
          - button "Ready to focus" [ref=e122] [cursor=pointer]
          - generic [ref=e123]: Your status is visible only when sharing is on.
        - generic [ref=e124]:
          - generic [ref=e125] [cursor=pointer]: Focus mode
          - generic [ref=e126] [cursor=pointer]: Break mode
        - generic [ref=e127]:
          - generic [ref=e128]: 25:00
          - generic [ref=e129]:
            - generic [ref=e130]:
              - generic [ref=e131]: This device’s timer
              - strong [ref=e132]: 0 min
            - button "Clear" [ref=e133] [cursor=pointer]
        - generic [ref=e134]:
          - button "Reset timer" [ref=e135] [cursor=pointer]: ↻
          - button "Start focus" [ref=e136] [cursor=pointer]: ▶
        - generic [ref=e137]:
          - generic [ref=e138]:
            - generic [ref=e139]: Focus
            - text: ":"
            - spinbutton "Focus" [ref=e140]: "25"
            - generic [ref=e141]: m
          - generic [ref=e143]:
            - generic [ref=e144]: Break
            - text: ":"
            - spinbutton "Break" [ref=e145]: "5"
            - generic [ref=e146]: m
        - group "Timer presets" [ref=e147]:
          - button "25 min focus / 5 min break" [ref=e148] [cursor=pointer]: 25/5
          - button "50 min focus / 10 min break" [ref=e149] [cursor=pointer]: 50/10
          - button "90 min focus / 15 min break" [ref=e150] [cursor=pointer]: 90/15
        - status [ref=e152]: Timer time stays on this device. An account saves validated sessions.
    - group [ref=e153]:
      - generic "Chat Room" [ref=e154] [cursor=pointer]
      - generic [ref=e155]:
        - generic [ref=e156]:
          - log "Room chat" [ref=e157]:
            - generic [ref=e158]: Messages will appear here
          - generic [ref=e159]:
            - textbox "Type a message..." [disabled] [ref=e160]
            - button "Send message" [disabled] [ref=e161]: ➤
        - button "Ambient sound" [ref=e163] [cursor=pointer]:
          - generic [ref=e164]: Ambient sound
          - generic [ref=e165]: ⌄
```

# Test source

```ts
  1  | const { test, expect } = require('@playwright/test');
  2  | 
  3  | test('stalled room lookup releases Join with a useful error and preserves the draft', async ({ page }) => {
  4  |     await page.addInitScript(() => localStorage.setItem('halastudyLang', 'en'));
  5  |     await page.goto('/open#join');
  6  |     await page.route('**/api/rooms/ABC123', () => {});
  7  |     await page.fill('#join-code', 'ABC123');
  8  |     await page.fill('#join-password', 'keep-my-draft');
  9  |     await page.click('#join-form button[type="submit"]');
  10 |     await expect(page.locator('#join-form button[type="submit"]')).toBeDisabled();
  11 |     await expect(page.locator('#join-form button[type="submit"]')).toBeEnabled({ timeout: 18000 });
  12 |     await expect(page.locator('#join-feedback')).toHaveClass(/error/);
  13 |     await expect(page.locator('#join-code')).toHaveValue('ABC123');
  14 |     await expect(page.locator('#join-password')).toHaveValue('keep-my-draft');
  15 |     await page.unroute('**/api/rooms/ABC123');
  16 |     await page.click('#join-form button[type="submit"]');
  17 |     await expect(page.locator('#join-feedback')).toContainText('not found');
  18 | });
  19 | 
  20 | test('stalled room runtime configuration settles and releases camera initialization', async ({ page }) => {
  21 |     await page.route('**/api/runtime-config', () => {});
  22 |     await page.addInitScript(() => {
  23 |         localStorage.setItem('halastudyLang', 'en');
  24 |         window.__cameraCalls = 0;
  25 |         navigator.mediaDevices.getUserMedia = async () => {
  26 |             window.__cameraCalls++;
  27 |             throw new Error('Synthetic device denial');
  28 |         };
  29 |     });
  30 |     await page.goto('/study');
> 31 |     await page.locator('#toggle-camera').click();
     |                                          ^ Error: locator.click: Test timeout of 45000ms exceeded.
  32 |     await expect.poll(() => page.evaluate(() => window.__cameraCalls), { timeout: 18000 }).toBeGreaterThan(0);
  33 | });
  34 | 
```
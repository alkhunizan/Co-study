# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: study-tools.smoke.spec.js >> F15-F20 favorite, RSVP, calendar, in-app reminder and private resource shelf work across members
- Location: tests\smoke\study-tools.smoke.spec.js:80:1

# Error details

```
Test timeout of 150000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - link "Skip to content" [ref=e2] [cursor=pointer]:
    - /url: "#main"
  - banner [ref=e3]:
    - link "Halastudy هلا" [ref=e4] [cursor=pointer]:
      - /url: /
      - generic [ref=e5]: Halastudy
      - generic [ref=e6]: هلا
    - generic [ref=e7]:
      - button "عربي" [ref=e8] [cursor=pointer]
      - button "EN" [pressed] [ref=e9] [cursor=pointer]
      - button "Theme" [ref=e10] [cursor=pointer]
  - generic [ref=e11]:
    - navigation "Workspace navigation" [ref=e12]:
      - link "Study" [ref=e13] [cursor=pointer]:
        - /url: /app#home
      - link "Progress" [ref=e14] [cursor=pointer]:
        - /url: /app#progress
      - link "Groups" [ref=e15] [cursor=pointer]:
        - /url: /app#circles
      - link "Account" [ref=e16] [cursor=pointer]:
        - /url: /app#account
    - main [ref=e17]:
      - generic [ref=e18]:
        - paragraph [ref=e19]: Good company
        - heading "Meet here. Focus together." [active] [level=1] [ref=e20]
        - paragraph [ref=e21]: Private circles with individual invitations, assigned supervisors, and attendance for each session.
        - paragraph [ref=e22]: Creating circles is a VIP benefit. Free accounts can accept invitations and participate.
        - generic [ref=e23]:
          - generic [ref=e24]: Invitation code
          - textbox "Invitation code" [ref=e25]
          - button "Join circle" [ref=e26] [cursor=pointer]
        - paragraph [ref=e28]: Your circles appear here after creating one or accepting an invitation.
  - contentinfo [ref=e29]:
    - generic [ref=e30]: Halastudy
    - link "Privacy" [ref=e31] [cursor=pointer]:
      - /url: /privacy
    - link "Terms" [ref=e32] [cursor=pointer]:
      - /url: /terms
```
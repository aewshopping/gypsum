# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e3]:
      - button "Handle files" [active] [ref=e4]
      - text: No files loaded
    - checkbox [ref=e6]
    - generic [ref=e7]:
      - generic [ref=e8]:
        - radio "snow" [checked] [ref=e9]
        - text: snow
      - generic [ref=e10]:
        - radio "glow" [ref=e11]
        - text: glow
  - main [ref=e12]:
    - generic [ref=e13]: Tag categories
    - paragraph [ref=e15]: Text files
    - generic [ref=e16]:
      - generic [ref=e17]:
        - generic [ref=e18]:
          - checkbox [ref=e20]
          - textbox "search... with text or property:value" [ref=e21]:
            - /placeholder: " search... with text or property:value "
          - button "↵" [ref=e22]
        - generic [ref=e23]:
          - generic [ref=e24]:
            - generic [ref=e25]: OR
            - generic [ref=e26]:
              - checkbox
            - generic [ref=e28]: AND
          - button "clear" [ref=e29] [cursor=pointer]
      - combobox [ref=e31]:
        - option "table view"
        - option "cards view" [selected]
        - option "list view"
        - option "search view"
```
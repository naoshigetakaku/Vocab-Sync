# tools

Things that run next to VocabSync rather than inside it.

## glossary-triage.html

461 English mathematical terms, read off `JapaneseGlossary2.pdf` (Zagier's
English–Japanese dictionary of mathematical terminology). Open the file in a
browser — it needs no server and no network.

One word at a time, Got it or Missed. Tap the card, or press Enter, to see the
Japanese; the arrow keys answer, left for Missed and right for Got it, the
same way round as the quiz in the app. Backspace undoes the last one.
Progress is kept in the browser, so it survives a reload and you can stop
part-way.

At the end it prints the missed words as four tab-separated columns, ready
for the Inbox tab.

**The Japanese is machine-read off a scan and is wrong here and there** — a
few rows are off by one, so a word can show its neighbour's gloss. Judge by
the English, and expect to correct some definitions after they are in.

To rebuild the list from a different PDF, the extraction used Apple Vision in
two passes — English at page scale, Japanese per row — because a single pass
mistook columns of kanji for vertical lines of text. The word list is inlined
in the HTML; there is no build step.

## The other half

The 300 words that came out of that triage are already baked into
`apps-script/AddMathGlossary.gs`, so there is nothing to paste: run
`addMathGlossary()` and they are filed under **Math Glossary**. Its sibling
`apps-script/AddConnectors.gs` does the same for 78 C1 academic connectors
under **Academic Connectors**. Both skip anything already in the folder, so
running one twice is harmless.

`apps-script/ImportFromInbox.gs` is the general route, for a list that does
not have a script of its own yet. It takes the four columns from an **Inbox**
tab of the spreadsheet and files them as words.

1. `setupInbox()` — makes the tab, once.
2. Paste into A1 (or under the header).
3. `previewInbox()` — changes nothing, says what would be added, skipped and
   rejected.
4. `importInbox()` — writes them in. Safe to run twice: a word already in the
   folder is skipped.

The folder is `INBOX_FOLDER` at the top of that file, `Math Glossary` by
default. It is created if it does not exist.

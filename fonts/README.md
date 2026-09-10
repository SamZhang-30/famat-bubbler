# Roboto Condensed

Source: https://github.com/google/fonts/tree/main/ofl/robotocondensed

Downloaded September 9, 2026 from `RobotoCondensed[wght].ttf`.
Source Git blob SHA: `221055572bc92e324d26337dee7b43b435e39fc8`.
Licensed under SIL OFL 1.1, included in `RobotoCondensed-OFL.txt`.

Static Regular (400) and Bold (700) instances generated with FontTools 4.64.0:

```
fonttools varLib.instancer 'RobotoCondensed[wght].ttf' wght=400 --update-name-table -o RobotoCondensed-Regular.ttf
fonttools varLib.instancer 'RobotoCondensed[wght].ttf' wght=700 --update-name-table -o RobotoCondensed-Bold.ttf
```

`embedded-fonts.js` contains both TTF files as base64 strings in
`window.FAMAT_PDF_FONT_DATA`, keyed by `RobotoCondensed` and `RobotoCondensedBold`.
Regenerate it from the TTF bytes when replacing the fonts. Loading the bytes as a
classic script avoids browser restrictions on fetching `file://` resources and
allows PDF creation offline. The app decodes the selected font and embeds
the used glyphs in the PDF through the bundled @pdf-lib/fontkit 1.1.1 dependency.
Printed student ID digits continue to use Courier.

# Records docs/demo.gif — run from the repo root: vhs docs/demo.tape
Output docs/demo.gif

Set Shell bash
Set FontSize 15
Set Width 1300
Set Height 760
Set Padding 18
Set Theme "Catppuccin Mocha"
Set TypingSpeed 60ms
Set WindowBar Colorful
Set Framerate 20

# Until gitflix is on npm, route "npx gitflix" to the local build.
Hide
Type `R=$PWD; npx() { shift; node "$R/dist/cli.js" "$@"; }; cd /opt/homebrew; clear`
Enter
Show

Sleep 500ms
Type "npx gitflix --max 3000 --speed 4"
Sleep 400ms
Enter
Sleep 4s

# Pause and step through a few commits
Space
Sleep 1.2s
Right
Sleep 700ms
Right
Sleep 700ms
Right
Sleep 1s

# Resume faster and run to the end
Space
Up
Sleep 4.5s
Sleep 1.5s
Type "q"
Sleep 3s

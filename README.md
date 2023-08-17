# codemp vscode
This repository contains the vscode extension for codemp

## Building
Just compiling is not enough: neon requires us to run `npm install` to produce a `*.node` file, loadable from nodejs.
A vscode extension is basically a zip archive with a `.vsix` estension.
If you're on Linux, the `.bundle.sh` script will produce a barebones extension bundle.

## Installing
From VSCode extensions tab, press the menu button and choose "install from vsix", then pick the previously built file.

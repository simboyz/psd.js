# psd.js

A Photoshop file format (PSD) parser written in Coffeescript/Javascript for both browsers and NodeJS implementations.

This implementation is more or less a direct port of the Python [psdparse](https://github.com/jerem/psdparse) library, with a little help from [png.js](https://github.com/devongovett/png.js).

## Current Status

**This is a work in progress and is not finished yet.**

Whats done?

* Read header information
* Find and read all image resources
* Read and parse all image layers
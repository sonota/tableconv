#!/bin/sh

bower install

mkdir js_ext
cp bower_components/jquery/dist/jquery.js js_ext/
cp bower_components/backbone/backbone.js js_ext/
cp bower_components/underscore/underscore.js js_ext/

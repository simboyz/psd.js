(function() {
  /*!
 *  Copyright © 2008 Fair Oaks Labs, Inc.
 *  All rights reserved.
 */

// Utility object:  Encode/Decode C-style binary primitives to/from octet arrays
function JSPack()
{
  // Module-level (private) variables
  var el,  bBE = false, m = this;


  // Raw byte arrays
  m._DeArray = function (a, p, l)
  {
    return [a.slice(p,p+l)];
  };
  m._EnArray = function (a, p, l, v)
  {
    for (var i = 0; i < l; a[p+i] = v[i]?v[i]:0, i++);
  };

  // ASCII characters
  m._DeChar = function (a, p)
  {
    return String.fromCharCode(a[p]);
  };
  m._EnChar = function (a, p, v)
  {
    a[p] = v.charCodeAt(0);
  };

  // Little-endian (un)signed N-byte integers
  m._DeInt = function (a, p)
  {
    var lsb = bBE?(el.len-1):0, nsb = bBE?-1:1, stop = lsb+nsb*el.len, rv, i, f;
    for (rv = 0, i = lsb, f = 1; i != stop; rv+=(a[p+i]*f), i+=nsb, f*=256);
    if (el.bSigned && (rv & Math.pow(2, el.len*8-1))) { rv -= Math.pow(2, el.len*8); }
    return rv;
  };
  m._EnInt = function (a, p, v)
  {
    var lsb = bBE?(el.len-1):0, nsb = bBE?-1:1, stop = lsb+nsb*el.len, i;
    v = (v<el.min)?el.min:(v>el.max)?el.max:v;
    for (i = lsb; i != stop; a[p+i]=v&0xff, i+=nsb, v>>=8);
  };

  // ASCII character strings
  m._DeString = function (a, p, l)
  {
    for (var rv = new Array(l), i = 0; i < l; rv[i] = String.fromCharCode(a[p+i]), i++);
    return rv.join('');
  };
  m._EnString = function (a, p, l, v)
  {
    for (var t, i = 0; i < l; a[p+i] = (t=v.charCodeAt(i))?t:0, i++);
  };

  // Little-endian N-bit IEEE 754 floating point
  m._De754 = function (a, p)
  {
    var s, e, m, i, d, nBits, mLen, eLen, eBias, eMax;
    mLen = el.mLen, eLen = el.len*8-el.mLen-1, eMax = (1<<eLen)-1, eBias = eMax>>1;

    i = bBE?0:(el.len-1); d = bBE?1:-1; s = a[p+i]; i+=d; nBits = -7;
    for (e = s&((1<<(-nBits))-1), s>>=(-nBits), nBits += eLen; nBits > 0; e=e*256+a[p+i], i+=d, nBits-=8);
    for (m = e&((1<<(-nBits))-1), e>>=(-nBits), nBits += mLen; nBits > 0; m=m*256+a[p+i], i+=d, nBits-=8);

    switch (e)
    {
      case 0:
        // Zero, or denormalized number
        e = 1-eBias;
        break;
      case eMax:
        // NaN, or +/-Infinity
        return m?NaN:((s?-1:1)*Infinity);
      default:
        // Normalized number
        m = m + Math.pow(2, mLen);
        e = e - eBias;
        break;
    }
    return (s?-1:1) * m * Math.pow(2, e-mLen);
  };
  m._En754 = function (a, p, v)
  {
    var s, e, m, i, d, c, mLen, eLen, eBias, eMax;
    mLen = el.mLen, eLen = el.len*8-el.mLen-1, eMax = (1<<eLen)-1, eBias = eMax>>1;

    s = v<0?1:0;
    v = Math.abs(v);
    if (isNaN(v) || (v == Infinity))
    {
      m = isNaN(v)?1:0;
      e = eMax;
    }
    else
    {
      e = Math.floor(Math.log(v)/Math.LN2);     // Calculate log2 of the value
      if (v*(c = Math.pow(2, -e)) < 1) { e--; c*=2; }   // Math.log() isn't 100% reliable

      // Round by adding 1/2 the significand's LSD
      if (e+eBias >= 1) { v += el.rt/c; }     // Normalized:  mLen significand digits
      else { v += el.rt*Math.pow(2, 1-eBias); }     // Denormalized:  <= mLen significand digits
      if (v*c >= 2) { e++; c/=2; }        // Rounding can increment the exponent

      if (e+eBias >= eMax)
      {
        // Overflow
        m = 0;
        e = eMax;
      }
      else if (e+eBias >= 1)
      {
        // Normalized - term order matters, as Math.pow(2, 52-e) and v*Math.pow(2, 52) can overflow
        m = (v*c-1)*Math.pow(2, mLen);
        e = e + eBias;
      }
      else
      {
        // Denormalized - also catches the '0' case, somewhat by chance
        m = v*Math.pow(2, eBias-1)*Math.pow(2, mLen);
        e = 0;
      }
    }

    for (i = bBE?(el.len-1):0, d=bBE?-1:1; mLen >= 8; a[p+i]=m&0xff, i+=d, m/=256, mLen-=8);
    for (e=(e<<mLen)|m, eLen+=mLen; eLen > 0; a[p+i]=e&0xff, i+=d, e/=256, eLen-=8);
    a[p+i-d] |= s*128;
  };


  // Class data
  m._sPattern = '(\\d+)?([AxcbBhHsfdiIlL])';
  m._lenLut = {'A':1, 'x':1, 'c':1, 'b':1, 'B':1, 'h':2, 'H':2, 's':1, 'f':4, 'd':8, 'i':4, 'I':4, 'l':4, 'L':4};
  m._elLut  = { 'A': {en:m._EnArray, de:m._DeArray},
        's': {en:m._EnString, de:m._DeString},
        'c': {en:m._EnChar, de:m._DeChar},
        'b': {en:m._EnInt, de:m._DeInt, len:1, bSigned:true, min:-Math.pow(2, 7), max:Math.pow(2, 7)-1},
        'B': {en:m._EnInt, de:m._DeInt, len:1, bSigned:false, min:0, max:Math.pow(2, 8)-1},
        'h': {en:m._EnInt, de:m._DeInt, len:2, bSigned:true, min:-Math.pow(2, 15), max:Math.pow(2, 15)-1},
        'H': {en:m._EnInt, de:m._DeInt, len:2, bSigned:false, min:0, max:Math.pow(2, 16)-1},
        'i': {en:m._EnInt, de:m._DeInt, len:4, bSigned:true, min:-Math.pow(2, 31), max:Math.pow(2, 31)-1},
        'I': {en:m._EnInt, de:m._DeInt, len:4, bSigned:false, min:0, max:Math.pow(2, 32)-1},
        'l': {en:m._EnInt, de:m._DeInt, len:4, bSigned:true, min:-Math.pow(2, 31), max:Math.pow(2, 31)-1},
        'L': {en:m._EnInt, de:m._DeInt, len:4, bSigned:false, min:0, max:Math.pow(2, 32)-1},
        'f': {en:m._En754, de:m._De754, len:4, mLen:23, rt:Math.pow(2, -24)-Math.pow(2, -77)},
        'd': {en:m._En754, de:m._De754, len:8, mLen:52, rt:0}};

  // Unpack a series of n elements of size s from array a at offset p with fxn
  m._UnpackSeries = function (n, s, a, p)
  {
    for (var fxn = el.de, rv = [], i = 0; i < n; rv.push(fxn(a, p+i*s)), i++);
    return rv;
  };

  // Pack a series of n elements of size s from array v at offset i to array a at offset p with fxn
  m._PackSeries = function (n, s, a, p, v, i)
  {
    for (var fxn = el.en, o = 0; o < n; fxn(a, p+o*s, v[i+o]), o++);
  };

  // Unpack the octet array a, beginning at offset p, according to the fmt string
  m.Unpack = function (fmt, a, p)
  {
    // Set the private bBE flag based on the format string - assume big-endianness
    bBE = (fmt.charAt(0) != '<');

    p = p?p:0;
    var re = new RegExp(this._sPattern, 'g'), m, n, s, rv = [];
    while (m = re.exec(fmt))
    {
      n = ((m[1]==undefined)||(m[1]==''))?1:parseInt(m[1]);
      s = this._lenLut[m[2]];
      if ((p + n*s) > a.length)
      {
        return undefined;
      }
      switch (m[2])
      {
        case 'A': case 's':
          rv.push(this._elLut[m[2]].de(a, p, n));
          break;
        case 'c': case 'b': case 'B': case 'h': case 'H':
        case 'i': case 'I': case 'l': case 'L': case 'f': case 'd':
          el = this._elLut[m[2]];
          rv.push(this._UnpackSeries(n, s, a, p));
          break;
      }
      p += n*s;
    }
    return Array.prototype.concat.apply([], rv);
  };

  // Pack the supplied values into the octet array a, beginning at offset p, according to the fmt string
  m.PackTo = function (fmt, a, p, values)
  {
    // Set the private bBE flag based on the format string - assume big-endianness
    bBE = (fmt.charAt(0) != '<');

    var re = new RegExp(this._sPattern, 'g'), m, n, s, i = 0, j;
    while (m = re.exec(fmt))
    {
      n = ((m[1]==undefined)||(m[1]==''))?1:parseInt(m[1]);
      s = this._lenLut[m[2]];
      if ((p + n*s) > a.length)
      {
        return false;
      }
      switch (m[2])
      {
        case 'A': case 's':
          if ((i + 1) > values.length) { return false; }
          this._elLut[m[2]].en(a, p, n, values[i]);
          i += 1;
          break;
        case 'c': case 'b': case 'B': case 'h': case 'H':
        case 'i': case 'I': case 'l': case 'L': case 'f': case 'd':
          el = this._elLut[m[2]];
          if ((i + n) > values.length) { return false; }
          this._PackSeries(n, s, a, p, values, i);
          i += n;
          break;
        case 'x':
          for (j = 0; j < n; j++) { a[p+j] = 0; }
          break;
      }
      p += n*s;
    }
    return a;
  };

  // Pack the supplied values into a new octet array, according to the fmt string
  m.Pack = function (fmt, values)
  {
    return this.PackTo(fmt, new Array(this.CalcLength(fmt)), 0, values);
  };

  // Determine the number of bytes represented by the format string
  m.CalcLength = function (fmt)
  {
    var re = new RegExp(this._sPattern, 'g'), m, sum = 0;
    while (m = re.exec(fmt))
    {
      sum += (((m[1]==undefined)||(m[1]==''))?1:parseInt(m[1])) * this._lenLut[m[2]];
    }
    return sum;
  };
};

var jspack = new JSPack(); ;
  function ord (string) {
    // http://kevin.vanzonneveld.net
    // +   original by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
    // +   bugfixed by: Onno Marsman
    // +   improved by: Brett Zamir (http://brett-zamir.me)
    // +   input by: incidence
    // *     example 1: ord('K');
    // *     returns 1: 75
    // *     example 2: ord('\uD800\uDC00'); // surrogate pair to create a single Unicode character
    // *     returns 2: 65536
    var str = string + '',
        code = str.charCodeAt(0);
    if (0xD800 <= code && code <= 0xDBFF) { // High surrogate (could change last hex to 0xDB7F to treat high private surrogates as single characters)
        var hi = code;
        if (str.length === 1) {
            return code; // This is just a high surrogate with no following low surrogate, so we return its value;
            // we could also throw an error as it is not a complete character, but someone may want to know
        }
        var low = str.charCodeAt(1);
        return ((hi - 0xD800) * 0x400) + (low - 0xDC00) + 0x10000;
    }
    if (0xDC00 <= code && code <= 0xDFFF) { // Low surrogate
        return code; // This is just a low surrogate with no preceding high surrogate, so we return its value;
        // we could also throw an error as it is not a complete character, but someone may want to know
    }
    return code;
}

function chr (codePt) {
    // http://kevin.vanzonneveld.net
    // +   original by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
    // +   improved by: Brett Zamir (http://brett-zamir.me)
    // *     example 1: chr(75);
    // *     returns 1: 'K'
    // *     example 1: chr(65536) === '\uD800\uDC00';
    // *     returns 1: true
    if (codePt > 0xFFFF) { // Create a four-byte string (length 2) since this code point is high
        //   enough for the UTF-16 encoding (JavaScript internal use), to
        //   require representation with two surrogates (reserved non-characters
        //   used for building other characters; the first is "high" and the next "low")
        codePt -= 0x10000;
        return String.fromCharCode(0xD800 + (codePt >> 10), 0xDC00 + (codePt & 0x3FF));
    }
    return String.fromCharCode(codePt);
};
  var arraySum;

arraySum = function(arr, from, to) {
  var i, sum;
  if (from == null) from = 0;
  if (to == null) to = arr.length - 1;
  sum = 0;
  for (i = from; from <= to ? i <= to : i >= to; from <= to ? i++ : i--) {
    sum += parseInt(arr[i], 10);
  }
  return sum;
};;
  /*
  END DEPENDENCIES
  */
  var Log, PSD, PSDFile, PSDHeader, PSDImage, PSDLayer, PSDLayerMask, PSDResource, Root, Util, fs,
    __hasProp = Object.prototype.hasOwnProperty;

  if (typeof exports !== "undefined" && exports !== null) {
    Root = exports;
    fs = require('fs');
  } else {
    Root = window;
  }

  Root.PSD = PSD = (function() {

    PSD.DEBUG = true;

    PSD.fromData = function(data) {
      return new PSD(data);
    };

    PSD.fromFile = function(filename) {
      var data;
      data = fs.readFileSync(filename);
      return new PSD(data);
    };

    PSD.fromURL = function(url) {};

    function PSD(data) {
      this.file = new PSDFile(data);
      this.header = null;
      this.resources = null;
      this.numLayers = 0;
      this.layers = null;
      this.images = null;
      this.mergedImage = null;
    }

    PSD.prototype.parse = function() {
      Log.debug("Beginning parsing");
      this.startTime = (new Date()).getTime();
      this.parseHeader();
      this.parseImageResources();
      this.parseLayersMasks();
      this.endTime = (new Date()).getTime();
      return Log.debug("Parsing finished in " + (this.endTime - this.startTime) + "ms");
    };

    PSD.prototype.parseHeader = function() {
      Log.debug("\n### Header ###");
      this.header = new PSDHeader(this.file);
      this.header.parse();
      return Log.debug(this.header);
    };

    PSD.prototype.parseImageResources = function() {
      var n, resource;
      Log.debug("\n### Resources ###");
      this.resources = [];
      n = this.file.readf(">L")[0];
      while (n > 0) {
        resource = new PSDResource(this.file);
        n -= resource.parse();
        Log.debug("Resource: ", resource);
      }
      if (n !== 0) {
        return Log.debug("Image resources overran expected size by " + (-n) + " bytes");
      }
    };

    PSD.prototype.parseLayersMasks = function() {
      if (!this.header) this.parseHeader();
      if (!this.resources) {
        this.file.skipBlock('image resources');
        this.resources = 'not parsed';
      }
      Log.debug("\n### Layers & Masks ###");
      this.layerMask = new PSDLayerMask(this.file, this.header);
      return this.layerMask.parse();
    };

    return PSD;

  })();

  PSDFile = (function() {

    function PSDFile(data) {
      this.data = data;
      this.pos = 0;
    }

    PSDFile.prototype.tell = function() {
      return this.pos;
    };

    PSDFile.prototype.read = function(bytes) {
      var i, _results;
      _results = [];
      for (i = 0; 0 <= bytes ? i < bytes : i > bytes; 0 <= bytes ? i++ : i--) {
        _results.push(this.data[this.pos++]);
      }
      return _results;
    };

    PSDFile.prototype.seek = function(amount, rel) {
      if (rel == null) rel = true;
      if (rel) {
        return this.pos += amount;
      } else {
        return this.pos = amount;
      }
    };

    PSDFile.prototype.readUInt32 = function() {
      var b1, b2, b3, b4;
      b1 = this.data[this.pos++] << 24;
      b2 = this.data[this.pos++] << 16;
      b3 = this.data[this.pos++] << 8;
      b4 = this.data[this.pos++];
      return b1 | b2 | b3 | b4;
    };

    PSDFile.prototype.readUInt16 = function() {
      var b1, b2;
      b1 = this.data[this.pos++] << 8;
      b2 = this.data[this.pos++];
      return b1 | b2;
    };

    PSDFile.prototype.readInt = function() {
      return this.readf(">i")[0];
    };

    PSDFile.prototype.readShortInt = function() {
      return this.readf(">h")[0];
    };

    PSDFile.prototype.readDouble = function() {
      return this.readf(">d")[0];
    };

    PSDFile.prototype.readBoolean = function() {
      return this.read(1)[0] !== 0;
    };

    PSDFile.prototype.readUnicodeString = function() {
      var charCode, i, str, strlen;
      str = "";
      strlen = this.readInt();
      for (i = 0; 0 <= strlen ? i < strlen : i > strlen; 0 <= strlen ? i++ : i--) {
        charCode = this.readShortInt();
        if (charCode > 0) str += chr(Util.i16(charCode));
      }
      return str;
    };

    PSDFile.prototype.readDescriptorStructure = function() {
      var classID, descriptors, i, items, key, name;
      name = this.readUnicodeString();
      classID = this.readLengthWithString();
      items = this.readInt();
      descriptors = {};
      for (i = 0; 0 <= items ? i < items : i > items; 0 <= items ? i++ : i--) {
        key = this.readLengthWithString().trim();
        descriptors[key] = this.readOsType();
      }
      return descriptors;
    };

    PSDFile.prototype.readString = function(length) {
      return this.readf(">" + length + "s");
    };

    PSDFile.prototype.readLengthWithString = function(defaultLen) {
      var length, str;
      if (defaultLen == null) defaultLen = 4;
      length = this.readInt();
      if (length === 0) {
        str = this.readf(">" + defaultLen + "s")[0];
      } else {
        str = this.readf(">" + length + "s")[0];
      }
      return str;
    };

    PSDFile.prototype.readOsType = function() {
      var i, length, listSize, num, osType, type, value;
      osType = this.readString(4);
      value = null;
      switch (osType) {
        case "TEXT":
          value = this.readUnicodeString();
          break;
        case "enum":
        case "Objc":
        case "GlbO":
          value = {
            typeID: this.readLengthWithString(),
            "enum": this.readLengthWithString()
          };
          break;
        case "VlLs":
          listSize = this.readInt();
          value = [];
          for (i = 0; 0 <= listSize ? i < listSize : i > listSize; 0 <= listSize ? i++ : i--) {
            value.push(this.readOsType());
          }
          break;
        case "doub":
          value = this.readDouble();
          break;
        case "UntF":
          value = {
            type: this.readString(4),
            value: this.readDouble()
          };
          break;
        case "long":
          value = this.readInt();
          break;
        case "bool":
          value = this.readBoolean();
          break;
        case "alis":
          length = this.readInt();
          value = this.readString(length);
          break;
        case "obj":
          num = this.readInt();
          for (i = 0; 0 <= num ? i < num : i > num; 0 <= num ? i++ : i--) {
            type = this.readString(4);
            switch (type) {
              case "prop":
                value = {
                  name: this.readUnicodeString(),
                  classID: this.readLengthWithString(),
                  keyID: this.readLengthWithString()
                };
                break;
              case "Clss":
                value = {
                  name: this.readUnicodeString(),
                  classID: this.readLengthWithString()
                };
                break;
              case "Enmr":
                value = {
                  name: this.readUnicodeString(),
                  classID: this.readLengthWithString(),
                  typeID: this.readLengthWithString(),
                  "enum": this.readLengthWithString()
                };
                break;
              case "rele":
                value = {
                  name: this.readUnicodeString(),
                  classID: this.readLengthWithString(),
                  offsetValue: this.readInt()
                };
                break;
              case "Idnt":
              case "indx":
              case "name":
                value = null;
            }
          }
          break;
        case "tdta":
          length = this.readInt();
          this.seek(length);
      }
      return {
        type: osType,
        value: value
      };
    };

    PSDFile.prototype.readBytesList = function(size) {
      var b, bytesRead, result, _i, _len;
      bytesRead = this.read(size);
      result = [];
      for (_i = 0, _len = bytesRead.length; _i < _len; _i++) {
        b = bytesRead[_i];
        result.push(ord(b));
      }
      return result;
    };

    PSDFile.prototype.readf = function(format) {
      return jspack.Unpack(format, this.read(jspack.CalcLength(format)));
    };

    PSDFile.prototype.skipBlock = function(desc) {
      var n;
      n = this.readf('>L')[0];
      if (n) this.seek(n);
      return Log.debug("Skipped " + desc + " with " + n + " bytes");
    };

    return PSDFile;

  })();

  PSDHeader = (function() {
    var HEADER_SECTIONS, MODES;

    HEADER_SECTIONS = ["sig", "version", "r0", "r1", "r2", "r3", "r4", "r5", "channels", "rows", "cols", "depth", "mode"];

    MODES = {
      0: 'Bitmap',
      1: 'GrayScale',
      2: 'IndexedColor',
      3: 'RGBColor',
      4: 'CMYKColor',
      5: 'HSLColor',
      6: 'HSBColor',
      7: 'Multichannel',
      8: 'Duotone',
      9: 'LabColor',
      10: 'Gray16',
      11: 'RGB48',
      12: 'Lab48',
      13: 'CMYK64',
      14: 'DeepMultichannel',
      15: 'Duotone16'
    };

    function PSDHeader(file) {
      this.file = file;
    }

    PSDHeader.prototype.parse = function() {
      var data, section, _i, _len, _ref;
      data = this.file.readf(">4sH 6B HLLHH");
      for (_i = 0, _len = HEADER_SECTIONS.length; _i < _len; _i++) {
        section = HEADER_SECTIONS[_i];
        this[section] = data.shift();
      }
      this.size = [this.rows, this.cols];
      if (this.sig !== "8BPS") throw "Not a PSD signature: " + this.header['sig'];
      if (this.version !== 1) {
        throw "Can not handle PSD version " + this.header['version'];
      }
      if ((0 <= (_ref = this.mode) && _ref < 16)) {
        this.modename = MODES[this.mode];
      } else {
        this.modename = "(" + this.mode + ")";
      }
      this.colormodepos = this.file.pos;
      return this.file.skipBlock("color mode data");
    };

    return PSDHeader;

  })();

  PSDImage = (function() {

    function PSDImage(mode, width, height, data) {
      this.mode = mode;
      this.width = width;
      this.height = height;
      this.data = data != null ? data : [];
      this.pixelData = [];
      switch (this.mode) {
        case "L":
          this.parseLuminance();
          break;
        case "RGB":
          this.parseRGB();
          break;
        case "RGBA":
          this.parseRGB(true);
      }
    }

    PSDImage.prototype.parseLuminance = function() {
      var val, _i, _len, _ref, _results;
      _ref = this.data;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        val = _ref[_i];
        this.pixelData.push(val);
        this.pixelData.push(val);
        this.pixelData.push(val);
        _results.push(this.pixelData.push(255));
      }
      return _results;
    };

    PSDImage.prototype.parseRGB = function(alpha) {
      var i, _ref, _results;
      if (alpha == null) alpha = false;
      _results = [];
      for (i = 0, _ref = this.width * this.height; 0 <= _ref ? i < _ref : i > _ref; 0 <= _ref ? i++ : i--) {
        this.pixelData.push(this.data.r[i]);
        this.pixelData.push(this.data.g[i]);
        this.pixelData.push(this.data.b[i]);
        _results.push(this.pixelData.push(alpha ? this.data.a[i] : 255));
      }
      return _results;
    };

    return PSDImage;

  })();

  PSDLayer = (function() {
    var BLEND_MODES, CHANNEL_SUFFIXES, COMPRESSIONS, SAFE_FONTS, SECTION_DIVIDER_TYPES;

    CHANNEL_SUFFIXES = {
      '-2': 'layer mask',
      '-1': 'A',
      0: 'R',
      1: 'G',
      2: 'B',
      3: 'RGB',
      4: 'CMYK',
      5: 'HSL',
      6: 'HSB',
      9: 'Lab',
      11: 'RGB',
      12: 'Lab',
      13: 'CMYK'
    };

    SECTION_DIVIDER_TYPES = {
      0: "other",
      1: "open folder",
      2: "closed folder",
      3: "bounding section divider"
    };

    COMPRESSIONS = {
      0: 'Raw',
      1: 'RLE',
      2: 'ZIP',
      3: 'ZIPPrediction'
    };

    BLEND_MODES = {
      "norm": "normal",
      "dark": "darken",
      "lite": "lighten",
      "hue": "hue",
      "sat": "saturation",
      "colr": "color",
      "lum": "luminosity",
      "mul": "multiply",
      "scrn": "screen",
      "diss": "dissolve",
      "over": "overlay",
      "hLit": "hard light",
      "sLit": "soft light",
      "diff": "difference",
      "smud": "exclusion",
      "div": "color dodge",
      "idiv": "color burn",
      "lbrn": "linear burn",
      "lddg": "linear dodge",
      "vLit": "vivid light",
      "lLit": "linear light",
      "pLit": "pin light",
      "hMix": "hard mix"
    };

    SAFE_FONTS = ["Arial", "Courier New", "Georgia", "Times New Roman", "Verdana", "Trebuchet MS", "Lucida Sans", "Tahoma"];

    function PSDLayer(file, baseLayer, header) {
      this.file = file;
      this.baseLayer = baseLayer != null ? baseLayer : false;
      this.header = header != null ? header : null;
      this.images = [];
      this.mask = {};
    }

    PSDLayer.prototype.parse = function(layerIndex) {
      var extralen, extrastart, key, prevPos, signature, size, _ref;
      if (layerIndex == null) layerIndex = null;
      if (this.baseLayer) return this.parseBaseLayer();
      this.parseInfo(layerIndex);
      this.parseBlendModes();
      extralen = this.file.readf(">L")[0];
      extrastart = this.file.tell();
      this.parseMaskData();
      while (this.file.pos - extrastart < extralen) {
        _ref = this.file.readf(">4s4s4s"), signature = _ref[0], key = _ref[1], size = _ref[2];
        prevPos = this.file.tell();
        switch (key) {
          case "lyid":
            this.id = this.file.readUInt16();
            break;
          case "shmd":
            this.readMetadata();
            break;
          case "lsct":
            this.readLayerSectionDivider();
            break;
          case "luni":
            this.name = this.file.readUnicodeString();
            Log.debug("Layer name: " + this.name);
            break;
          case "vmsk":
            this.readVectorMask();
            break;
          case "TySh":
            this.readTypeTool();
        }
      }
      return this.file.seek(extrastart + extralen, false);
    };

    PSDLayer.prototype.parseBaseLayer = function() {
      var chanDelta, channels, height, i, width, _ref;
      height = this.header.height;
      width = this.header.width;
      this.top = 0;
      this.left = 0;
      this.bottom = height;
      this.right = width;
      this.width = width;
      this.height = height;
      channels = this.header.channels;
      chanDelta = 3 - channels;
      this.channelsInfo = [];
      for (i = chanDelta, _ref = channels + chanDelta; chanDelta <= _ref ? i < _ref : i > _ref; chanDelta <= _ref ? i++ : i--) {
        this.channelsInfo.push([i, 0]);
      }
      this.blendMode = {
        code: "norm",
        label: "normal"
      };
      this.opacity = 255;
      this.visible = true;
      this.name = "Canvas";
      return this.layerId = 0;
    };

    PSDLayer.prototype.parseInfo = function(layerIndex) {
      var channelID, channelLength, i, _ref, _ref2, _ref3, _ref4, _results;
      this.idx = layerIndex;
      /*
          Layer Info
      */
      _ref = this.file.readf(">LLLLH"), this.top = _ref[0], this.left = _ref[1], this.bottom = _ref[2], this.right = _ref[3], this.channels = _ref[4];
      _ref2 = [this.bottom - this.top, this.right - this.left], this.rows = _ref2[0], this.cols = _ref2[1];
      Log.debug("Layer " + this.idx + ":", this);
      if (this.bottom < this.top || this.right < this.left || this.channels > 64) {
        Log.debug("Somethings not right, attempting to skip layer.");
        this.file.seek(6 * this.channels + 12);
        this.file.skipBlock("layer info: extra data");
        return;
      }
      this.channelsInfo = [];
      _results = [];
      for (i = 0, _ref3 = this.channels; 0 <= _ref3 ? i < _ref3 : i > _ref3; 0 <= _ref3 ? i++ : i--) {
        _ref4 = this.file.readf(">hL"), channelID = _ref4[0], channelLength = _ref4[1];
        Log.debug("Channel " + i + ": id=" + channelID + ", " + channelLength + " bytes, type=" + CHANNEL_SUFFIXES[channelID]);
        _results.push(this.channelsInfo.push([channelID, channelLength]));
      }
      return _results;
    };

    PSDLayer.prototype.parseBlendModes = function() {
      var _ref;
      this.blendMode = {};
      _ref = this.file.readf(">4s4sBBBB"), this.blendMode.sig = _ref[0], this.blendMode.key = _ref[1], this.blendMode.opacity = _ref[2], this.blendMode.clipping = _ref[3], this.blendMode.flags = _ref[4], this.blendMode.filler = _ref[5];
      this.blendMode.key = this.blendMode.key.trim();
      this.blendMode.opacp = (this.blendMode.opacity * 100 + 127) / 255;
      this.blendMode.blending = BLEND_MODES[this.blendMode.key];
      return Log.debug("Blending mode:", this.blendMode);
    };

    PSDLayer.prototype.parseMaskData = function() {
      var _ref, _ref2;
      this.mask.size = this.file.readf(">L")[0];
      if (this.mask.size) {
        _ref = this.file.readf(">LLLLBB"), this.mask.top = _ref[0], this.mask.left = _ref[1], this.mask.bottom = _ref[2], this.mask.right = _ref[3], this.mask.defaultColor = _ref[4], this.mask.flags = _ref[5];
        this.file.seek(this.mask.size - 18);
        _ref2 = [this.mask.bottom - this.mask.top, this.mask.right - this.mask.left], this.mask.rows = _ref2[0], this.mask.cols = _ref2[1];
      }
      return this.file.skipBlock("layer blending ranges");
    };

    PSDLayer.prototype.readMetadata = function() {
      var count, i, key, padding, sig, _ref, _results;
      Log.debug("Parsing layer metadata...");
      count = this.file.readUInt16();
      _results = [];
      for (i = 0; 0 <= count ? i < count : i > count; 0 <= count ? i++ : i--) {
        _ref = this.file.readf(">4s4s4s"), sig = _ref[0], key = _ref[1], padding = _ref[2];
        _results.push(this.file.skipBlock("image metadata"));
      }
      return _results;
    };

    PSDLayer.prototype.readLayerSectionDivider = function() {
      var code;
      code = this.file.readUInt16();
      return this.layerType = SECTION_DIVIDER_TYPES[code];
    };

    PSDLayer.prototype.readVectorMask = function() {
      var flags, version;
      version = this.file.readInt();
      return flags = this.file.read(4);
    };

    PSDLayer.prototype.readTypeTool = function() {
      var color, descrVer, end, fontI, fontName, fontsList, i, j, lineHeight, piece, psDict, rectangle, safeFontName, st, start, style, styleRun, styledText, stylesList, stylesRunList, text, textData, textVer, transforms, ver, wrapData, wrapVer, _i, _len, _ref, _ref2;
      ver = this.file.readShortInt();
      transforms = [];
      for (i = 0; i < 6; i++) {
        transforms.push(this.file.readDouble());
      }
      textVer = this.file.readShortInt();
      descrVer = this.file.readInt();
      if (ver !== 1 || textVer !== 50 || descrVer !== 16) return;
      textData = this.file.readDescriptorStructure();
      wrapVer = this.readShortInt();
      descrVer = this.readInt();
      wrapData = this.file.readDescriptorStructure();
      rectangle = [];
      for (i = 0; i < 4; i++) {
        rectangle.push(this.file.readDouble());
      }
      this.textData = textData;
      this.wrapData = wrapData;
      styledText = [];
      psDict = this.textData.EngineData.value;
      text = psDict.EngineDict.Editor.Text;
      styleRun = psDict.EngineDict.StyleRun;
      stylesList = styleRun.RunArray;
      stylesRunList = styleRun.RunLengthArray;
      fontsList = psDict.DocumentResources.FontSet;
      start = 0;
      for (i in stylesList) {
        if (!__hasProp.call(stylesList, i)) continue;
        style = stylesList[i];
        st = style.StyleSheet.StyleSheetData;
        end = parseInt(start + stylesRunList[i], 10);
        fontI = st.Font;
        fontName = fontsList[fontI].Name;
        safeFontName = this.getSafeFont(fontName);
        color = [];
        _ref = st.FillColor.Values.slice(1);
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          j = _ref[_i];
          color.push(255 * j);
        }
        lineHeight = st.Leading === 1500 ? "Auto" : st.Leading;
        piece = text.slice(start, end);
        styledText.push({
          text: piece,
          style: {
            font: safeFontName,
            size: st.FontSize,
            color: Util.rgbToHex("rgb(" + color[0] + ", " + color[1] + ", " + color[2] + ")"),
            underline: st.Underline,
            allCaps: st.FontCaps,
            italic: !!~fontName.indexOf("Italic") || st.FauxItalic,
            bold: !!~fontName.indexOf("Bold") || st.FauxBold,
            letterSpacing: st.Tracking / 20,
            lineHeight: lineHeight,
            paragraphEnds: (_ref2 = piece.substr(-1)) === "\n" || _ref2 === "\r"
          }
        });
        start += stylesRunList[i];
      }
      return this.styledText = styledText;
    };

    PSDLayer.prototype.getSafeFont = function(font) {
      var it, safeFont, word, _i, _j, _len, _len2, _ref;
      for (_i = 0, _len = SAFE_FONTS.length; _i < _len; _i++) {
        safeFont = SAFE_FONTS[_i];
        it = true;
        _ref = safeFont.split(" ");
        for (_j = 0, _len2 = _ref.length; _j < _len2; _j++) {
          word = _ref[_j];
          if (!!!~font.indexOf(word)) it = false;
        }
        if (it) return safeFont;
      }
      return font;
    };

    PSDLayer.prototype.getImageData = function(readPlaneInfo, lineLengths) {
      var ch, channel, channelId, channelTuple, height, i, length, opacityDivider, result, width, _i, _len, _ref, _ref2;
      if (readPlaneInfo == null) readPlaneInfo = true;
      if (lineLengths == null) lineLengths = [];
      this.channels = {
        a: [],
        r: [],
        g: [],
        b: []
      };
      opacityDivider = this.opacity / 255;
      _ref = this.channelsInfo;
      for (i in _ref) {
        if (!__hasProp.call(_ref, i)) continue;
        channelTuple = _ref[i];
        channelId = channelTuple[0], length = channelTuple[1];
        if (channelId < -1) {
          width = this.mask.cols;
          height = this.mask.rows;
        } else {
          width = this.cols;
          height = this.rows;
        }
        channel = this.readColorPlane(readPlaneInfo, lineLengths, i, height, width);
        switch (channelId) {
          case -1:
            this.channels.a = [];
            for (_i = 0, _len = channel.length; _i < _len; _i++) {
              ch = channel[_i];
              this.channels.a.push(ch * opacityDivider);
            }
            break;
          case 0:
            this.channels.r = channel;
            break;
          case 1:
            this.channels.g = channel;
            break;
          case 2:
            this.channels.b = channel;
            break;
          default:
            result = [];
            for (i = 0, _ref2 = channel.length; 0 <= _ref2 ? i < _ref2 : i > _ref2; 0 <= _ref2 ? i++ : i--) {
              result.push(this.channels.a[i] * (channel[i] / 255));
            }
            this.channels.a = result;
        }
      }
      return this.makeImage();
    };

    PSDLayer.prototype.readColorPlane = function(readPlaneInfo, lineLengths, planeNum, height, width) {
      var a, compression, imageData, rleEncoded, size;
      size = width * height;
      imageData = [];
      rleEncoded = false;
      if (readPlaneInfo) {
        compression = this.file.readShortInt();
        Log.debug("Compression: id=" + compression + ", name=" + COMPRESSIONS[compression]);
        rleEncoded = compression === 1;
        if (rleEncoded) {
          if (!lineLengths) {
            lineLengths = [];
            for (a = 0; 0 <= height ? a < height : a > height; 0 <= height ? a++ : a--) {
              lineLengths.push(this.file.readShortInt());
            }
          }
        } else {
          Log.debug("ERROR: compression not implemented yet. Skipping.");
        }
        planeNum = 0;
      } else {
        rleEncoded = lineLengths.length !== 0;
      }
      if (rleEncoded) {
        imageData = this.readPlaneCompressed(lineLengths, planeNum, height, width);
      } else {
        imageData = this.file.readBytesList(size);
      }
      return imageData;
    };

    PSDLayer.prototype.readPlaneCompressed = function(lineLengths, planeNum, height, width) {
      var b, i, len, lineIndex, pos, s, x, _ref;
      b = [];
      for (x = 0, _ref = width * height; 0 <= _ref ? x < _ref : x > _ref; 0 <= _ref ? x++ : x--) {
        b.push(0);
      }
      s = [];
      pos = 0;
      lineIndex = planeNum * height;
      for (i = 0; 0 <= height ? i < height : i > height; 0 <= height ? i++ : i--) {
        len = lineLengths[lineIndex];
        lineIndex++;
        s = this.file.readBytesList(len);
        this.decodeRLE(s, 0, len, b, pos);
        pos += width;
      }
      return b;
    };

    PSDLayer.prototype.decodeRLE = function(src, sindex, slen, dst, dindex) {
      var b, i, max, n, _ref, _results;
      max = sindex + slen;
      _results = [];
      while (sindex < max) {
        b = src[sindex];
        sindex++;
        n = b;
        if (b > 127) {
          n = 255 - n + 2;
          b = src[sindex];
          sindex++;
          _results.push((function() {
            var _results2;
            _results2 = [];
            for (i = 0; 0 <= n ? i < n : i > n; 0 <= n ? i++ : i--) {
              dst[dindex] = b;
              _results2.push(dindex++);
            }
            return _results2;
          })());
        } else {
          n++;
          [].splice.apply(dst, [dindex, (dindex + n) - dindex].concat(_ref = src.slice(sindex, (sindex + n)))), _ref;
          dindex += n;
          _results.push(sindex += n);
        }
      }
      return _results;
    };

    PSDLayer.prototype.makeImage = function() {
      var type;
      if (!(this.cols != null) || !(this.rows != null)) return;
      type = isNaN(this.channels.a[0]) ? "RGB" : "RGBA";
      this.image = new PSDImage(type, this.cols, this.rows, this.channels);
      return Log.debug("Image: type=" + type + ", width=" + this.cols + ", height=" + this.rows);
    };

    return PSDLayer;

  })();

  PSDLayerMask = (function() {

    function PSDLayerMask(file, header) {
      this.file = file;
      this.header = header;
      this.layers = [];
    }

    PSDLayerMask.prototype.parse = function() {
      var baseLayer, h, height, i, layer, layerInfoSize, lineLengths, maskSize, nLines, pos, rle, _i, _len, _ref, _ref2;
      maskSize = this.file.readInt();
      pos = this.file.tell();
      Log.debug("Layer mask size is " + maskSize);
      if (maskSize > 0) {
        layerInfoSize = Util.pad2(this.file.readInt());
        if (layerInfoSize > 0) {
          this.numLayers = this.file.readShortInt();
          if (this.numLayers < 0) this.numLayers = Math.abs(this.numLayers);
          if (this.numLayers * (18 + 6 * this.header.channels) > layerInfoSize) {
            throw "Unlikely number of " + this.numLayers + " layers for " + this.header['channels'] + " with " + layerInfoSize + " layer info size. Giving up.";
          }
          Log.debug("Found " + this.numLayers + " layer(s)");
          for (i = 0, _ref = this.numLayers; 0 <= _ref ? i < _ref : i > _ref; 0 <= _ref ? i++ : i--) {
            layer = new PSDLayer(this.file);
            layer.parse(i);
            this.layers.push(layer);
          }
          _ref2 = this.layers;
          for (_i = 0, _len = _ref2.length; _i < _len; _i++) {
            layer = _ref2[_i];
            layer.getImageData();
          }
          this.layers.reverse();
        }
        this.file.seek(maskSize);
      }
      baseLayer = new PSDLayer(this.file, true, this.header);
      rle = this.file.readShortInt() === 1;
      height = baseLayer.height;
      if (rle) {
        nLines = height * baseLayer.channelsInfo.length;
        lineLengths = [];
        for (h = 0; 0 <= nLines ? h < nLines : h > nLines; 0 <= nLines ? h++ : h--) {
          lineLengths.push(this.readShortInt());
        }
        baseLayer.getImageData(false, lineLengths);
      } else {
        baseLayer.getImageData(false);
      }
      if (!this.layers.length) return this.layers.push(baseLayer);
    };

    PSDLayerMask.prototype.groupLayers = function() {
      var layer, parents, _i, _len, _ref, _results;
      parents = [];
      _ref = this.layers;
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        layer = _ref[_i];
        layer.parent = parents[parents.length - 1] || null;
        layer.parents = parents.slice(1);
        if (layer.layerType.code === 0) continue;
        if (layer.layerType.code === 3 && parents.length > 0) {
          _results.push(delete parents[parents.length - 1]);
        } else {
          _results.push(parents.push(layer));
        }
      }
      return _results;
    };

    return PSDLayerMask;

  })();

  PSDResource = (function() {
    var RESOURCE_DESCRIPTIONS;

    RESOURCE_DESCRIPTIONS = {
      1000: 'PS2.0 mode data',
      1001: 'Macintosh print record',
      1003: 'PS2.0 indexed color table',
      1005: 'ResolutionInfo',
      1006: 'Names of the alpha channels',
      1007: 'DisplayInfo',
      1008: 'Caption',
      1009: 'Border information',
      1010: 'Background color',
      1011: 'Print flags',
      1012: 'Grayscale/multichannel halftoning info',
      1013: 'Color halftoning info',
      1014: 'Duotone halftoning info',
      1015: 'Grayscale/multichannel transfer function',
      1016: 'Color transfer functions',
      1017: 'Duotone transfer functions',
      1018: 'Duotone image info',
      1019: 'B&W values for the dot range',
      1021: 'EPS options',
      1022: 'Quick Mask info',
      1024: 'Layer state info',
      1025: 'Working path',
      1026: 'Layers group info',
      1028: 'IPTC-NAA record (File Info)',
      1029: 'Image mode for raw format files',
      1030: 'JPEG quality',
      1032: 'Grid and guides info',
      1033: 'Thumbnail resource',
      1034: 'Copyright flag',
      1035: 'URL',
      1036: 'Thumbnail resource',
      1037: 'Global Angle',
      1038: 'Color samplers resource',
      1039: 'ICC Profile',
      1040: 'Watermark',
      1041: 'ICC Untagged',
      1042: 'Effects visible',
      1043: 'Spot Halftone',
      1044: 'Document specific IDs',
      1045: 'Unicode Alpha Names',
      1046: 'Indexed Color Table Count',
      1047: 'Transparent Index',
      1049: 'Global Altitude',
      1050: 'Slices',
      1051: 'Workflow URL',
      1052: 'Jump To XPEP',
      1053: 'Alpha Identifiers',
      1054: 'URL List',
      1057: 'Version Info',
      2999: 'Name of clipping path',
      10000: 'Print flags info'
    };

    function PSDResource(file) {
      this.file = file;
    }

    PSDResource.prototype.parse = function() {
      var n, _ref;
      this.at = this.file.tell();
      _ref = this.file.readf(">4s H B"), this.type = _ref[0], this.id = _ref[1], this.namelen = _ref[2];
      n = Util.pad2(this.namelen + 1) - 1;
      this.name = this.file.readf(">" + n + "s")[0];
      this.name = this.name.substr(0, this.name.length - 1);
      this.short = this.name.substr(0, 20);
      this.size = this.file.readf(">L")[0];
      this.file.seek(Util.pad2(this.size));
      this.rdesc = "[" + RESOURCE_DESCRIPTIONS[this.id] + "]";
      return 4 + 2 + Util.pad2(1 + this.namelen) + 4 + Util.pad2(this.size);
    };

    return PSDResource;

  })();

  Util = (function() {

    function Util() {}

    Util.i16 = function(c) {
      return ord(c[1]) + (ord(c[0]) << 8);
    };

    Util.i32 = function(c) {
      return ord(c[3]) + (ord(c[2]) << 8) + (ord(c[1]) << 16) + (ord(c[0]) << 24);
    };

    Util.pad2 = function(i) {
      return Math.floor((i + 1) / 2) * 2;
    };

    Util.pad4 = function(i) {
      return Math.floor((i + 3) / 4) * 4;
    };

    Util.rgbToHex = function(c) {
      var m;
      m = /rgba?\((\d+), (\d+), (\d+)/.exec(c);
      if (m) {
        return '#' + (m[1] << 16 | m[2] << 8 | m[3]).toString(16);
      } else {
        return c;
      }
    };

    return Util;

  })();

  Log = (function() {

    function Log() {}

    Log.debug = Log.log = function() {
      return this.output("log", arguments);
    };

    Log.output = function(method, data) {
      if (typeof exports !== "undefined" && exports !== null) {
        if (PSD.DEBUG) return console[method].apply(null, data);
      } else {
        if (PSD.DEBUG) return console[method]("[PSD]", data);
      }
    };

    return Log;

  })();

}).call(this);

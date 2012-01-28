class PSDHeader
  HEADER_SECTIONS = [
    "sig"
    "version"
    "r0"
    "r1"
    "r2"
    "r3"
    "r4"
    "r5"
    "channels"
    "rows"
    "cols"
    "depth"
    "mode"
  ]

  MODES =
    0:  'Bitmap'
    1:  'GrayScale'
    2:  'IndexedColor'
    3:  'RGBColor'
    4:  'CMYKColor'
    5:  'HSLColor'
    6:  'HSBColor'
    7:  'Multichannel'
    8:  'Duotone'
    9:  'LabColor'
    10: 'Gray16'
    11: 'RGB48'
    12: 'Lab48'
    13: 'CMYK64'
    14: 'DeepMultichannel'
    15: 'Duotone16'

  constructor: (@file) ->
    @data = null

  parse: ->
    data = @file.readf ">4sH 6B HLLHH"
    @[section] = data.shift() for section in HEADER_SECTIONS
    @size = [@rows, @cols]

    if @sig isnt "8BPS"
      throw "Not a PSD signature: #{@header['sig']}"
    
    if @version isnt 1
      throw "Can not handle PSD version #{@header['version']}"

    if 0 <= @mode < 16
      @modename = MODES[@mode]
    else
      @modename = "(#{@mode})"

    @colormodepos = @file.pos
    @file.skipBlock "color mode data"

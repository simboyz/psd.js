class PSDImage
  constructor: (@mode, @width, @height, @data = []) ->
    @pixelData = []

    switch @mode
      when "L" then @parseLuminance()
      when "RGB" then @parseRGB()
      when "RGBA" then @parseRGB(true)

  parseLuminance: ->
    for val in @data
      @pixelData.push val
      @pixelData.push val
      @pixelData.push val
      @pixelData.push 255

  parseRGB: (alpha = false) ->
    for i in [0...(@width*@height)]
      @pixelData.push @data.r[i]
      @pixelData.push @data.g[i]
      @pixelData.push @data.b[i]
      @pixelData.push if alpha then @data.a[i] else 255
        
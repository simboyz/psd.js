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
    for i in [0...@data.length] by 4
      @pixelData[i] = @data[i]
      @pixelData[i+1] = @data[i+1]
      @pixelData[i+2] = @data[i+2]
      @pixelData[i+3] = if alpha then @data[i+3] else 255
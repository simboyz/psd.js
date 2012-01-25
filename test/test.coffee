fs = require 'fs'

{PSD} = require __dirname + '/../lib/psd.js'

psd = PSD.fromFile __dirname + '/test.psd'
psd.parse()

fs.writeFile __dirname + '/output.json', JSON.stringify(psd, null, 2), ->
  console.log "Output written to output.json"
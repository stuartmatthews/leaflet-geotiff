# leaflet-geotiff
A [LeafletJS](http://www.leafletjs.com) plugin for displaying geoTIFF raster data.  

**[DEMO](https://stuartmatthews.github.io/leaflet-geotiff/)**

This plugin uses [geotiff.js](https://github.com/constantinius/geotiff.js)  and [plotty](https://github.com/santilland/plotty).

## Instructions

1. Include the JavaScript file and dependencies:
```html
    <script src="https://npmcdn.com/leaflet@1.0.3/dist/leaflet.js"></script>
    <script src="vendor/geotiff.js"></script>
    <script src="vendor/plotty.js"></script>
    <script src="leaflet-geotiff.js"></script>
```

2. Add a geoTIFF layer `L.leafletGeotiff(url,options)`
  * `url` - geoTIFF file url.  Currently only EPSG:4326 files are supported.
  * `options`:
    * `bounds` - (optional) Leaflet [Bounds](http://leafletjs.com/reference-1.0.3.html#bounds) object.  If omitted the image bounds will be read from the geoTIFF file.
    * `band` - (optional, default = 0) geoTIFF band to read.   
    * `image` - (optional, default = 0) geoTIFF image to read.    
    * `colorScale` - (optional, default = "rainbow").  Plotty color scale used to render the image.
    * `displayMin`,`displayMax` - Minimum and maximum values to plot.
    * `clampLow`, `clampHigh` - (optional, default = true) If true values outside `displayMin` to `displayMax` will be rendered as if they were valid values.
    * `vector` - (optional, default = false) If true the data is interpreted as a direction and rendered as arrows.
    * `arrowSize` - (optional, default = 20) Size in pixels of direction arrows for vector data.
    * `clip` - (optional, default = undefined) Clipping polygon, provided as an araay of [lat,lon] coordinates.
    

3. Data values can be extracted using the `getValueAtLatLng(lat,lng)` method.

## Dependencies

  * leaflet-geotiff works with Leaflet 0.7.7 and >=1.0
  * Requries:
    * [geotiff.js](https://github.com/constantinius/geotiff.js)
    * [plotty](https://github.com/santilland/plotty)
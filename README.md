# leaflet-geotiff
A [LeafletJS](http://www.leafletjs.com) plugin for displaying geoTIFF raster data.  Data can drawn as colored rasters or directon arrows.  The layer can be clipped using a polygon.

**[DEMO](https://stuartmatthews.github.io/leaflet-geotiff/)**

![Sample](https://stuartmatthews.github.io/leaflet-geotiff/example.png)

This plugin uses [geotiff.js](https://github.com/constantinius/geotiff.js) and [plotty](https://github.com/santilland/plotty).

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
    * `displayMin`,`displayMax` - Minimum and maximum values to plot.
    * `clampLow`, `clampHigh` - (optional, default = true) If true values outside `displayMin` to `displayMax` will be rendered as if they were valid values.
    * `bounds` - (optional) An array specifying the corners of the data, e.g. [[40.712216, -74.22655], [40.773941, -74.12544]].  If omitted the image bounds will be read from the geoTIFF file.
    * `band` - (optional, default = 0) geoTIFF band to read.   
    * `image` - (optional, default = 0) geoTIFF image to read.    
    * `colorScale` - (optional, default = "rainbow").  Plotty color scale used to render the image.
    * `vector` - (optional, default = false) If true the data is interpreted as a direction and rendered as arrows.
    * `arrowSize` - (optional, default = 20) Size in pixels of direction arrows for vector data.
    * `clip` - (optional, default = undefined) Clipping polygon, provided as an array of [lat,lon] coordinates.  Note that this is the Leaflet [lat,lon] convention, not geoJSON [lon,lat].
    
3. Data values can be extracted using the `getValueAtLatLng(lat,lng)` method.

4. New color scales can be created using plotty's addColorScale method.

## Dependencies

  * leaflet-geotiff works with Leaflet 0.7.7 and >=1.0
  * Requires:
    * [geotiff.js](https://github.com/constantinius/geotiff.js)
    * [plotty](https://github.com/santilland/plotty)
var geoPlotty = (function() {

  // Colorscale definitions
  var colorscales = plotty.colorscales;

  function hasOwnProperty(obj, prop) {
      var proto = obj.__proto__ || obj.constructor.prototype; // jshint ignore:line
      return (prop in obj) &&
          (!(prop in proto) || proto[prop] !== obj[prop]);
  }

  function defaultFor(arg, val) { return typeof arg !== 'undefined' ? arg : val; }

  function create3DContext(canvas, opt_attribs) {
    var names = ["webgl", "experimental-webgl"];
    var context = null;
    for (var ii = 0; ii < names.length; ++ii) {
      try {
        context = canvas.getContext(names[ii], opt_attribs);
      } catch(e) {}  // eslint-disable-line
      if (context) {
        break;
      }
    }
    if (!context || !context.getExtension('OES_texture_float')) {
      return null;
    }
    return context;
  }

  function setRectangle(gl, x, y, width, height) {
    var x1 = x;
    var x2 = x + width;
    var y1 = y;
    var y2 = y + height;
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
       x1, y1,
       x2, y1,
       x1, y2,
       x1, y2,
       x2, y1,
       x2, y2]), gl.STATIC_DRAW);
  }

  // Definition of vertex shader
  var vertexShaderSource = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    uniform mat3 u_matrix;
    uniform vec2 u_resolution;
    varying vec2 v_texCoord;
    varying vec2 v_pixCoord;
    void main() {
      // apply transformation matrix
      vec2 position = (u_matrix * vec3(a_position, 1)).xy;
      // convert the rectangle from pixels to 0.0 to 1.0
      vec2 zeroToOne = position / u_resolution;
      // convert from 0->1 to 0->2
      vec2 zeroToTwo = zeroToOne * 2.0;
      // convert from 0->2 to -1->+1 (clipspace)
      vec2 clipSpace = zeroToTwo - 1.0;
      gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
      // pass the texCoord to the fragment shader
      // The GPU will interpolate this value between points.
      v_texCoord = a_texCoord;
      v_pixCoord = a_position;
    }`;


  // Definition of fragment shader
  var fragmentShaderSource = `
    precision mediump float;
    
    const float PI = 3.1415926535897932384626433832795;
    
    // our texture
    uniform sampler2D u_textureData;
    uniform sampler2D u_textureScale;
    uniform vec2 u_textureSize;
    uniform vec2 u_domain;
    uniform float u_noDataValue;
    uniform bool u_clampLow;
    uniform bool u_clampHigh;

    // spatial reference 
    uniform float latMax;
    uniform float latMin;
    uniform float lngMin;
    uniform float lngMax;

    uniform float xOrigin;
    uniform float yOrigin;
    
    uniform float transformationA;
    uniform float transformationB;
    uniform float transformationC;
    uniform float transformationD;
    uniform float scale;
    uniform float d;
    
    // the texCoords passed in from the vertex shader.
    varying vec2 v_pixCoord;

    void main() {
      float yUntransformed = ((yOrigin+v_pixCoord.y) / scale - transformationD) / transformationC;
      float currentLat = (2.0 * atan(exp(yUntransformed)) - (PI / 2.0)) * d;
      float rasterY = 1.0-(currentLat - latMin)/(latMax-latMin);

      float xUntransformed = ((xOrigin+v_pixCoord.x) / scale - transformationB) / transformationA;
      float currentLng = xUntransformed * d;
      float rasterX = (currentLng - lngMin)/(lngMax-lngMin); 
      
      float value = texture2D(u_textureData, vec2(rasterX,rasterY))[0];
      
      if (value == u_noDataValue)
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
      else if ((!u_clampLow && value < u_domain[0]) || (!u_clampHigh && value > u_domain[1]))
        gl_FragColor = vec4(0, 0, 0, 0);
      else {
        float normalisedValue = (value - u_domain[0]) / (u_domain[1] - u_domain[0]);
        gl_FragColor = texture2D(u_textureScale, vec2(normalisedValue, 0));
      }
    }`;
	
	/**
   * @lends plotty
   */

  /**
   * The raster plot class.
   * @memberof module:plotty
   * @constructor
   * @param {Object} options the options to pass to the plot.
   * @param {HTMLCanvasElement} [options.canvas] the canvas to render to
   * @param {TypedArray} [options.data] the raster data to render
   * @param {Number} [options.width] the width of the input raster
   * @param {Number} [options.height] the height of the input raster
   * @param {Object[]} [options.datasets] a list of named datasets. each must
   *                                      have 'id', 'data', 'width' and 'height'.
   * @param {(HTMLCanvasElement|HTMLImageElement)} [options.colorScaleImage] the color scale image to use
   * @param {String} [options.colorScale] the name of a named color scale to use
   * @param {Number[]} [options.domain] the value domain to scale the color
   * @param {Boolean} [options.clampLow] whether or now values below the domain
   *                                     shall be clamped
   * @param {Boolean} [options.clampHigh] whether or now values above the domain
   *                                      shall be clamped
   * @param {Number} [options.noDataValue] the no-data value that shall always
   *                                       hidden
   *
   * @param {Array} [options.matrix] Transformation matrix
   *
   */
  var plot = function(options) {
    this.datasetCollection = {};
    this.currentDataset = null;
    this.options = options;
    
    this.setCanvas(options.canvas);
    // check if a webgl context is requested and available and set up the shaders
    var gl;
    if (defaultFor(options.useWebGL, true) && (gl = create3DContext(this.canvas))) {
       console.log('gl');
      this.gl = gl;

      // create the shader program
      var vertexShader = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vertexShader, vertexShaderSource);
      gl.compileShader(vertexShader);
      if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(vertexShader));
      }

      var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fragmentShader, fragmentShaderSource);
      gl.compileShader(fragmentShader);
      if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(fragmentShader));
      }

      var program = this.program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      gl.useProgram(this.program);

      // look up where the vertex data needs to go.
      var texCoordLocation = gl.getAttribLocation(program, "a_texCoord");

      // provide texture coordinates for the rectangle.
      this.texCoordBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        0.0,  0.0,
        1.0,  0.0,
        0.0,  1.0,
        0.0,  1.0,
        1.0,  0.0,
        1.0,  1.0]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(texCoordLocation);
      gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);
    }
    else {
      this.ctx = this.canvas.getContext("2d");
    }

    if (options.colorScaleImage) {
      this.setColorScaleImage(options.colorScaleImage);
    }
    else {
      this.setColorScale(defaultFor(options.colorScale, 'viridis'));
    }
    this.setDomain(defaultFor(options.domain, [0, 1]));
    this.setClamp(defaultFor(options.clampLow, true), options.clampHigh);
    this.setNoDataValue(options.noDataValue);

    if (options.data) {
      var l = options.data.length;
      this.setData(
        options.data,
        defaultFor(options.dataWidth, options.data[l-2]),
        defaultFor(options.dataHeight, options.data[l-2])
      );
    }

    if (options.datasets) {
      for (var i = 0; i < options.datasets.length; ++i) {
        var ds = options.datasets[i];
        this.addDataset(ds.id, ds.data, ds.width, ds.height);
      }
    }

    if (options.matrix) {
      this.matrix = options.matrix
    } else {  // if no matrix is provided, supply identity matrix
      this.matrix = [
          1, 0, 0,
          0, 1, 0,
          0, 0, 1
      ];
    }
  };

  /**
   * Get the raw data from the currently selected dataset.
   * @returns {TypedArray} the data of the currently selected dataset.
   */
  plot.prototype.getData = function() {
    var dataset = this.currentDataset;
    if (!dataset) {
      throw new Error("No dataset available.");
    }
    return dataset.data;
  };

  /**
   * Query the raw raster data at the specified coordinates.
   * @param {Number} x the x coordinate
   * @param {Number} y the y coordinate
   * @returns {Number} the value at the specified coordinates
   */
  plot.prototype.atPoint = function(x, y) {
    var dataset = this.currentDataset;
    if (!dataset) {
      throw new Error("No dataset available.");
    }
    else if (x >= dataset.width || y >= dataset.height) {
      throw new Error("Coordinates are outside of image bounds.");
    }
    return dataset.data[(y * dataset.width) + x];
  };

  var createDataset = function(gl, id, data, width, height) {
    var textureData;
    if (gl) {
      // gl.viewport(0, 0, width, height);
      textureData = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, textureData);

      // Set the parameters so we can render any size image.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

      // Upload the image into the texture.
      gl.texImage2D(gl.TEXTURE_2D, 0,
        gl.LUMINANCE,
        width, height, 0,
        gl.LUMINANCE, gl.FLOAT, new Float32Array(data)
      );
      
    }
    return {
      textureData: textureData, width: width, height: height, data: data, id: id
    };
  };

  /**
   * Set the raw raster data to be rendered. This creates a new unnamed dataset.
   * @param {TypedArray} data the raw raster data. This can be a typed array of
   *                          any type, but will be coerced to Float32Array when
   *                          beeing rendered.
   * @param {int} width the width of the raster image
   * @param {int} height the height of the data
   */
  plot.prototype.setData = function(data, width, height) {
    if (this.currentDataset && this.currentDataset.id === null) {
      destroyDataset(this.gl, this.currentDataset);
    }
    this.currentDataset = createDataset(this.gl, null, data, width, height);
  };

  /**
   * Add a new named dataset. The semantics are the same as with @see setData.
   * @param {string} id the identifier for the dataset.
   * @param {TypedArray} data the raw raster data. This can be a typed array of
   *                          any type, but will be coerced to Float32Array when
   *                          beeing rendered.
   * @param {int} width the width of the raster image
   * @param {int} height the height of the data
   */
  plot.prototype.addDataset = function(id, data, width, height) {
    if (this.datasetAvailable(id)) {
      throw new Error("There is already a dataset registered with id '" + id + "'");
    }
    this.datasetCollection[id] = createDataset(this.gl, id, data, width, height);
    if (!this.currentDataset) {
      this.currentDataset = this.datasetCollection[id];
    }
  };

  /**
   * Set the current dataset to be rendered.
   * @param {string} id the identifier of the dataset to be rendered.
   */
  plot.prototype.setCurrentDataset = function(id) {
    if (!this.datasetAvailable(id)) {
      throw new Error("No such dataset registered: '" + id +  "'");
    }
    if (this.currentDataset && this.currentDataset.id === null) {
      destroyDataset(this.gl, this.currentDataset);
    }
    this.currentDataset = this.datasetCollection[id];
  };

  var destroyDataset = function(gl, dataset) {
    if (gl) {
      gl.deleteTexture(dataset.textureData);
    }
  };

  /**
   * Remove the dataset.
   * @param {string} id the identifier of the dataset to be removed.
   */
  plot.prototype.removeDataset = function(id) {
    var dataset = this.datasetCollection[id];
    if (!dataset) {
      throw new Error("No such dataset registered: '" + id +  "'");
    }
    destroyDataset(this.gl, dataset);
    if (this.currentDataset === dataset) {
      this.currentDataset = null;
    }
    delete this.datasetCollection[id];
  };

  /**
   * Check if the dataset is available.
   * @param {string} id the identifier of the dataset to check.
   * @returns {Boolean} whether or not a dataset with that identifier is defined
   */
  plot.prototype.datasetAvailable = function(id) {
    return hasOwnProperty(this.datasetCollection, id);
  };

  /**
   * Retrieve the rendered color scale image.
   * @returns {(HTMLCanvasElement|HTMLImageElement)} the canvas or image element
   *                                                 for the rendered color scale
   */
  plot.prototype.getColorScaleImage = function() {
    return this.colorScaleImage;
  };

  /**
   * Set the canvas to draw to. When no canvas is supplied, a new canvas element
   * is created.
   * @param {HTMLCanvasElement} [canvas] the canvas element to render to.
   */
  plot.prototype.setCanvas = function(canvas) {
    this.canvas = canvas || document.createElement("canvas");
  };

  /**
   * Get the canvas that is currently rendered to.
   * @returns {HTMLCanvasElement} the canvas that is currently rendered to.
   */
  plot.prototype.getCanvas = function() {
    return this.canvas;
  };

  /**
   * Set the new value domain for the rendering.
   * @param {float[]} domain the value domain range in the form [low, high]
   */
  plot.prototype.setDomain = function(domain) {
    if (!domain || domain.length !== 2) {
      throw new Error("Invalid domain specified.");
    }
    this.domain = domain;
  };

  /**
   * Add a new colorscale to the list of available colorscales.
   * @memberof module:plotty
   * @param {String} name the name of the newly defined color scale
   * @param {String[]} colors the array containing the colors. Each entry shall
   *                          adhere to the CSS color definitions.
   * @param {Number[]} positions the value position for each of the colors
   */
  var addColorScale = function(name, colors, positions) {
    if (colors.length !== positions.length) {
      throw new Error("Invalid color scale.");
    }
    colorscales[name] = {
      colors: colors,
      positions: positions
    };
  };

  /**
   * Render the colorscale to the specified canvas.
   * @memberof module:plotty
   * @param {String} name the name of the color scale to render
   * @param {HTMLCanvasElement} canvas the canvas to render to
   */
  var renderColorScaleToCanvas = function(name, canvas) {
    var cs_def = colorscales[name];
    canvas.height = 1;
    var canvas_ctx = canvas.getContext("2d");

    if (Object.prototype.toString.call(cs_def) === "[object Object]") {
      canvas.width = 256;
      var gradient = canvas_ctx.createLinearGradient(0, 0, 256, 1);

      for (var i = 0; i < cs_def.colors.length; ++i) {
        gradient.addColorStop(cs_def.positions[i], cs_def.colors[i]);
      }
      canvas_ctx.fillStyle = gradient;
      canvas_ctx.fillRect(0, 0, 256, 1);
      
    }
    else if (Object.prototype.toString.call(cs_def) === "[object Uint8Array]") {
      canvas.width = 256;
      var imgData = canvas_ctx.createImageData(256, 1);
      imgData.data.set(cs_def);
      canvas_ctx.putImageData(imgData, 0, 0);
    }
    else {
      throw new Error("Color scale not defined.");
    }
  };

  /**
   * Set the currently selected color scale.
   * @param {string} name the name of the colorscale. Must be registered.
   */
  plot.prototype.setColorScale = function(name) {
    if (!hasOwnProperty(colorscales, name)) {
      throw new Error("No such color scale '" + name + "'");
    }
    if (!this.colorScaleCanvas) {
      // Create single canvas to render colorscales
      this.colorScaleCanvas = document.createElement('canvas');
      this.colorScaleCanvas.width = 256;
      this.colorScaleCanvas.height = 1;  
    }
    renderColorScaleToCanvas(name, this.colorScaleCanvas);
    this.name = name;
    this.setColorScaleImage(this.colorScaleCanvas);
  };

  /**
   * Set the currently selected color scale as an image or canvas.
   * @param {(HTMLCanvasElement|HTMLImageElement)} colorScaleImage the new color
   *                                                               scale image
   */
  plot.prototype.setColorScaleImage = function(colorScaleImage) {
    this.colorScaleImage = colorScaleImage;
    var gl = this.gl;
    if (gl) {
      if (this.textureScale) {
        gl.deleteTexture(this.textureScale);
      }
      this.textureScale = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.textureScale);

      // Set the parameters so we can render any size image.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      // Upload the image into the texture.
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, colorScaleImage);
    }
  };

  /**
   * Set the clamping for the lower and the upper border of the values. When
   * clamping is enabled for either side, the values below or above will be
   * clamped to the minimum/maximum color.
   * @param {Boolean} clampLow whether or not the minimum shall be clamped.
   * @param {Boolean} clampHigh whether or not the maxmimum shall be clamped.
   *                            defaults to clampMin.
   */
  plot.prototype.setClamp = function(clampLow, clampHigh) {
    this.clampLow = clampLow;
    this.clampHigh = (typeof clampHigh !== "undefined") ? clampHigh : clampLow;
  };

  /**
   * Set the no-data-value: a special value that will be rendered transparent.
   * @param {float} noDataValue the no-data-value. Use null to clear a
   *                            previously set no-data-value.
   */
  plot.prototype.setNoDataValue = function(noDataValue) {
    this.noDataValue = noDataValue;
  };

  /**
   * Render the map to the specified canvas with the given settings.
   */
  plot.prototype.render = function(options) {
    var canvas = this.canvas;
    var dataset = this.currentDataset;

    canvas.width = options.plotWidth;
    canvas.height = options.plotHeight;

    if (this.gl) {
      var gl = this.gl;
      gl.viewport(0, 0, options.plotWidth, options.plotHeight);
      gl.useProgram(this.program);
      // set the images
      gl.uniform1i(gl.getUniformLocation(this.program, "u_textureData"), 0);
      gl.uniform1i(gl.getUniformLocation(this.program, "u_textureScale"), 1);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, dataset.textureData);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.textureScale);

      var positionLocation = gl.getAttribLocation(this.program, "a_position");
      var domainLocation = gl.getUniformLocation(this.program, "u_domain");
      var resolutionLocation = gl.getUniformLocation(this.program, "u_resolution");
      var noDataValueLocation = gl.getUniformLocation(this.program, "u_noDataValue");
      var clampLowLocation = gl.getUniformLocation(this.program, "u_clampLow");
      var clampHighLocation = gl.getUniformLocation(this.program, "u_clampHigh");
      var matrixLocation = gl.getUniformLocation(this.program, 'u_matrix');

      var latMax = gl.getUniformLocation(this.program, 'latMax');
      var latMin = gl.getUniformLocation(this.program, 'latMin');
      var lngMax = gl.getUniformLocation(this.program, 'lngMax');
      var lngMin = gl.getUniformLocation(this.program, 'lngMin');
      var xOrigin = gl.getUniformLocation(this.program, 'xOrigin');
      var yOrigin = gl.getUniformLocation(this.program, 'yOrigin');
      var transformationA = gl.getUniformLocation(this.program, 'transformationA');
      var transformationB = gl.getUniformLocation(this.program, 'transformationB');
      var transformationC = gl.getUniformLocation(this.program, 'transformationC');
      var transformationD = gl.getUniformLocation(this.program, 'transformationD');
      var scale = gl.getUniformLocation(this.program, 'scale');
      var d  = gl.getUniformLocation(this.program, 'd');
      
      gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
      gl.uniform2fv(domainLocation, this.domain);
      gl.uniform1i(clampLowLocation, this.clampLow);
      gl.uniform1i(clampHighLocation, this.clampHigh);
      gl.uniform1f(noDataValueLocation, this.noDataValue);
      gl.uniformMatrix3fv(matrixLocation, false, this.matrix);

      gl.uniform1f(latMax, this.options.north);
      gl.uniform1f(latMin, this.options.south);
      gl.uniform1f(lngMax, this.options.east);
      gl.uniform1f(lngMin, this.options.west);
      gl.uniform1f(xOrigin, options.xOrigin);
      gl.uniform1f(yOrigin, options.yOrigin);
      gl.uniform1f(transformationA, options.transformationA);
      gl.uniform1f(transformationB, options.transformationB);
      gl.uniform1f(transformationC, options.transformationC);
      gl.uniform1f(transformationD, options.transformationD);
      gl.uniform1f(scale, options.scale);
      gl.uniform1f(d, options.d);
      
      var positionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

      setRectangle(gl, 0, 0, canvas.width, canvas.height);

      // Draw the rectangle.
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    else if (this.ctx) {
      var ctx = this.ctx;
      var w = canvas.width;
      var h = canvas.height;

      var imageData = ctx.createImageData(w, h);

      var trange = this.domain[1] - this.domain[0];
      var steps = this.colorScaleCanvas.width;
      var csImageData = this.colorScaleCanvas.getContext("2d").getImageData(0, 0, steps, 1).data;
      var alpha;

      var data = dataset.data;

      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {

          var i = (y*w)+x;
          // TODO: Possible increase of performance through use of worker threads?

          var index = ((y*w)+x)*4;

          var c = Math.round(((data[i] - this.domain[0]) / trange) * steps);
          alpha = 255;
          if (c < 0) {
            c = 0;
            if (!this.clampLow) {
              alpha = 0;
            }
          } 
          else if (c > 255) {
            c = 255;
            if (!this.clampHigh) {
              alpha = 0;
            }
          }
          
          if (isNaN(data[i]) || (data[i] === this.noDataValue)) {
            alpha = 0;
          }

          imageData.data[index+0] = csImageData[c*4];
          imageData.data[index+1] = csImageData[c*4+1];
          imageData.data[index+2] = csImageData[c*4+2];
          imageData.data[index+3] = alpha;
        }
      }

      ctx.putImageData(imageData, 0, 0); // at coords 0,0
    }
	
  };

  /**
   * Render the specified dataset with the current settings.
   * @param {string} id the identifier of the dataset to render.
   */
  plot.prototype.renderDataset = function(id) {
    this.setCurrentDataset(id);
    return this.render();
  };

  /**
   * Get the color for the specified value.
   * @param {flaot} val the value to query the color for.
   * @returns {Array} the 4-tuple: red, green, blue, alpha in the range 0-255.
   */
  plot.prototype.getColor = function getColor(val) {
    var steps = this.colorScaleCanvas.width;
    var csImageData = this.colorScaleCanvas.getContext("2d")
                                           .getImageData(0, 0, steps, 1).data;
    var trange = this.domain[1] - this.domain[0];
    var c = Math.round(((val - this.domain[0]) / trange) * steps);
    var alpha = 255;
    if (c < 0) {
      c = 0;
      if (!this.clampLow) {
        alpha = 0;
      }
    } 
    if (c > 255) {
      c = 255;
      if (!this.clampHigh) {
        alpha = 0;
      }
    }

    return [
      csImageData[c*4],
      csImageData[c*4+1],
      csImageData[c*4+2],
      alpha
    ];
  };

  return {
    plot: plot, addColorScale: addColorScale, colorscales: colorscales,
    renderColorScaleToCanvas: renderColorScaleToCanvas
  };
})();


if (typeof module !== "undefined") {
  module.exports = geoPlotty;
}
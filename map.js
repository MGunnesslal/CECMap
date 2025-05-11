// =========================================================
// CEC Applications Interactive Map
// =========================================================
/*
---------Code Layout--------
----------------------------
1. Initialize Map
2. UTM Zone 20N conversion constants
3. Base Layers
4. Collapsible Info Panel
5. Geocoder & Search Marker
6. CEC Application Data, Markers & Heatmap
7. View Toggle Between Heatmap & Markers
8. Toggle Button & Filter Button Listeners
9. Filter Controls
10. GeoJSON Layer Setup
11. NSL index
12. Spatial Analysis

*/

// Initialize map
var map = L.map('map', {
  center: [10.6918, -61.2225],
  zoom: 9,
  maxZoom: 20, //sets the level of zoom possible on the basemap
  zoomControl: true
});

// UTM Zone 20N (EPSG:32620) and WGS84
proj4.defs("EPSG:32620", "+proj=utm +zone=20 +datum=WGS84 +units=m +no_defs");
const utmToLatLng = (easting, northing) => {
  const [lon, lat] = proj4("EPSG:32620", "WGS84", [easting, northing]);
  return [lat, lon];
};


// ------------------------------------------
// Base Layers
// ------------------------------------------
var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
	maxZoom: 20,
  attribution: '&copy; OpenStreetMap contributors'
});

var satellite = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  { 
  maxZoom: 20,
  attribution: 'Tiles &copy; Esri' }
);

var googlemap = L.tileLayer(
  'https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
	maxZoom: 20,
    attribution: 'Google'
});

// Add default base layer
osm.addTo(map);

L.control.layers({
  "OpenStreetMap": osm,
  //"Esri Satellite": satellite,
  "Google Map": googlemap
}).addTo(map);

L.control.scale({ position: 'bottomleft' }).addTo(map);

// ------------------------------------------
// Collapsible Info Panel
// ------------------------------------------
const toggleBtn = document.getElementById('toggleBtn');
const welcome = document.getElementById('welcome');

toggleBtn.addEventListener('click', () => {
  welcome.classList.toggle('collapsed');
  toggleBtn.textContent = welcome.classList.contains('collapsed')
    ? 'Open Info Panel'
    : 'Close Info Panel';
});

// ------------------------------------------
// Geocoder & Search Marker
// ------------------------------------------
let searchMarker = null;
const bounds = L.latLngBounds([10.0, -62.1], [11.5, -60.3]);

const searchIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  shadowSize: [41, 41]
});

const geocoder = L.Control.geocoder({
  defaultMarkGeocode: false,
  placeholder: "Search place or lat/lng...",
  errorMessage: "Nothing found.",
  geocoder: L.Control.Geocoder.nominatim({
    geocodingQueryParams: {
      viewbox: [-62.1, 11.5, -60.3, 10.0].join(','),
      bounded: 1
    }
  })
}).addTo(map);

geocoder.on('markgeocode', function (e) {
  const center = e.geocode.center;
  if (searchMarker) map.removeLayer(searchMarker);
  searchMarker = L.marker(center, { icon: searchIcon }).addTo(map)
    .bindPopup(e.geocode.name)
    .openPopup();
  map.setView(center, 14);
});
/*
setTimeout(() => {
  const input = document.querySelector('.leaflet-control-geocoder-form input');
  const form = document.querySelector('.leaflet-control-geocoder-form');

  if (!input || !form) return;

  form.addEventListener('submit', function (e) {
    const query = input.value.trim();

    if (query === '') {
      e.preventDefault();
      if (searchMarker) {
        map.removeLayer(searchMarker);
        searchMarker = null;
      }
      return;
    }

    const latlngRegex = /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/;
    if (latlngRegex.test(query)) {
      e.preventDefault();
      const [lat, lon] = query.split(',').map(Number);
      const latlng = [lat, lon];
      if (searchMarker) map.removeLayer(searchMarker);
      searchMarker = L.marker(latlng, { icon: searchIcon }).addTo(map)
        .bindPopup(`LatLng: ${lat.toFixed(5)}, ${lon.toFixed(5)}`)
        .openPopup();
      map.setView(latlng, 24);
    }
  });

  input.addEventListener('keyup', function () {
    if (input.value.trim() === '' && searchMarker) {
      map.removeLayer(searchMarker);
      searchMarker = null;
    }
  });
}, 500);
*/
// ------------------------------------------
// CEC Application Data, Markers & Heatmap
// ------------------------------------------
const cecApplicationLayer = L.featureGroup();
const geojsonLayers = {};

let jsonData = [];
let currentData = [];
const markers = L.markerClusterGroup();
const heatLayer = L.heatLayer([], {
  radius: 45,
  blur: 25,
  gradient: {
    0.2: '#771f11',
    0.4: '#771f11',
    0.6: '#771f11',
    0.8: '#771f11',
    1.0: '#771f11'
  }
});
let currentView = "heatmap"; // "markers" // - the default view for the points

function autoExpand(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = textarea.scrollHeight + "px";
}


fetch("https://script.google.com/macros/s/AKfycbwt0wHDljsk3hIPR9MLD3BDt1wVM_DzQT5eI7vfZl-iSJ7W5VtWJFS2Gqp7InHUQIqPhw/exec")
  .then(response => response.json())
  .then(data => {
  jsonData = data;
  currentData = [...data];
  updateMarkers(currentData);
  updateHeatmap(currentData);
  populateFilterOptions(jsonData);
  toggleLayerView();
  setTimeout(() => {
  initializeGeocoderSearch();
  }, 1000);
})
  .catch(error => console.error("Error loading data:", error));

function updateMarkers(data) {
  markers.clearLayers();
  cecApplicationLayer.clearLayers(); // Also clear from featureGroup

  data.forEach(row => {
    const easting = parseFloat(row.Easting);
    const northing = parseFloat(row.Northing);
    const [lat, lon] = (!isNaN(easting) && !isNaN(northing)) ? utmToLatLng(easting, northing) : [null, null];

    if (lat !== null && lon !== null) {
      row.Latitude = lat;
	  row.Longitude = lon;
	  const marker = L.marker([lat, lon]);

      // GeoJSON-style feature for Turf.js
      marker.feature = {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [lon, lat]
        },
        properties: {
          ref: row["CEC Reference"],
          year: row["Year"],
          status: row["Application Determination"]
        }
      };

      cecApplicationLayer.addLayer(marker);
      marker.bindPopup(`
        <p><b>CEC Reference:</b> ${row["CEC Reference"]}</p>
        <p><b>Year:</b> ${row["Year"]}</p>
        <p><b>Applicant:</b> ${row["Applicant"]}</p>
        <p><b>Designated Activity:</b> ${row["Designated Activity"]}</p>
        <p><b>Location:</b> ${row["Activity Location"]}</p>
        <p><b>Easting:</b> ${row["Easting"]}</p>
        <p><b>Northing:</b> ${row["Northing"]}</p>
        <p><b>Status:</b> ${row["Application Determination"]}</p>
        <p><b>Determination Date:</b> ${row["Determination Date"]}</p>
      `);

      markers.addLayer(marker);
    }
  });

  updateResultsCount(data.length);
  geojsonLayers["CEC Applications"] = cecApplicationLayer;
}


function updateHeatmap(data) {
  const heatData = data.map(row => {
  const easting = parseFloat(row.Easting);
  const northing = parseFloat(row.Northing);
  const [lat, lon] = (!isNaN(easting) && !isNaN(northing)) ? utmToLatLng(easting, northing) : [null, null];
    return (!isNaN(lat) && !isNaN(lon)) ? [lat, lon, 1] : null;
  }).filter(d => d !== null);
  heatLayer.setLatLngs(heatData);
  updateResultsCount(data.length);
}

// ------------------------------------------
// View Toggle Between Heatmap & Markers
// ------------------------------------------
function toggleLayerView() {
  map.removeLayer(markers);
  map.removeLayer(heatLayer);
  //removeLegend();

  if (currentView === "heatmap") {
    map.addLayer(heatLayer);
    updateToggleButtonText("Show Marker View");
    //addLegend();
  } else {
    map.addLayer(markers);
    updateToggleButtonText("Show Heatmap View");
  }
}

function updateToggleButtonText(text) {
  const btn = document.getElementById("toggleViewButton");
  if (btn) btn.textContent = text;
}

// ------------------------------------------
// Heatmap Legend (visible only in heatmap view)
// ------------------------------------------
/*
let legend;
function addLegend() {
  legend = L.control({ position: 'bottomright' });
  legend.onAdd = function () {
    const div = L.DomUtil.create('div', 'info legend');
    div.innerHTML = '<strong>Heat Intensity</strong><br>' +
                    '<i style="background:#771f11"></i> High<br>';
    return div;
  };
  legend.addTo(map);
}

function removeLegend() {
  if (legend) {
    legend.remove();
    legend = null;
  }
}
*/

// ------------------------------------------
// Toggle Button & Filter Button Listeners
// ------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById("toggleViewButton");
  const applyBtn = document.getElementById("applyFiltersBtn");
  const clearBtn = document.getElementById("clearFiltersBtn");

  if (toggleBtn) {
    toggleBtn.addEventListener("click", function () {
      currentView = (currentView === "markers") ? "heatmap" : "markers";
      toggleLayerView();
    });
  }

  if (applyBtn) applyBtn.addEventListener("click", applyFilters);
  if (clearBtn) clearBtn.addEventListener("click", clearFilters);
});

document.addEventListener('DOMContentLoaded', () => {
  const rightPanel = document.getElementById("rightPanel");
  const toggleBtn = document.getElementById("rightPanelToggle");
  const toggleContainer = document.getElementById("rightPanelToggleContainer");

  if (rightPanel && toggleBtn && toggleContainer) {
    toggleBtn.addEventListener("click", () => {
      rightPanel.classList.toggle("expanded");
      const isExpanded = rightPanel.classList.contains("expanded");

      // Change icon
      toggleBtn.innerHTML = isExpanded ? "&#x25B6;" : "&#x25C0;"; // ▶ : ◀

      // Adjust toggle container position via class
      toggleContainer.style.right = isExpanded ? "400px" : "0px";
    });
  }
});


// ------------------------------------------
// Filter Controls
// ------------------------------------------
function populateFilterOptions(data) {
  const years = new Set();
  const statuses = new Set();

  data.forEach(row => {
    if (row.Year) years.add(row.Year.toString());
    if (row["Application Determination"]) statuses.add(row["Application Determination"]);
  });

  const sortedYears = Array.from(years).sort();
  const sortedStatuses = Array.from(statuses).sort();

  populateSelect("yearStart", sortedYears, true);
  populateSelect("yearEnd", sortedYears, true);
  populateSelect("statusFilter", sortedStatuses, true);
}

function populateSelect(id, values, addDefault = false) {
  const select = document.getElementById(id);
  select.innerHTML = '';
  if (addDefault) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "All";
    select.appendChild(opt);
  }
  values.forEach(value => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    select.appendChild(opt);
  });
}

function applyFilters() {
  const start = document.getElementById("yearStart").value;
  const end = document.getElementById("yearEnd").value;
  const status = document.getElementById("statusFilter").value;

  const filtered = jsonData.filter(row => {
    const year = row.Year.toString();
    const withinRange = (!start || !end) || (year >= start && year <= end);
    const statusMatch = !status || row["Application Determination"] === status;
    return withinRange && statusMatch;
  });

  currentData = filtered;
  updateMarkers(currentData);
  updateHeatmap(currentData);
  toggleLayerView();
}

function clearFilters() {
  document.getElementById("yearStart").value = "";
  document.getElementById("yearEnd").value = "";
  document.getElementById("statusFilter").value = "";
  currentData = [...jsonData];
  updateMarkers(currentData);
  updateHeatmap(currentData);
  toggleLayerView();
}

function updateResultsCount(count) {
  const el = document.getElementById("resultsCount");
  if (el) {
    el.textContent = `Showing ${count} applications`;
  }
}
// ------------------------------------------
// GeoJSON Layers Setup
// ------------------------------------------
const geojsonFiles = [
  { name: "Aripo Savannas (Buffer)", url: "https://raw.githubusercontent.com/MGunnesslal/leaflet-geojson-layers/refs/heads/main/Aripo%20Savannas%20Buffer.geojson" },
  { name: "Aripo Savannas", url: "https://raw.githubusercontent.com/MGunnesslal/leaflet-geojson-layers/refs/heads/main/Aripo%20Savannas.geojson" },
  { name: "Caroni Swamp", url: "https://raw.githubusercontent.com/MGunnesslal/leaflet-geojson-layers/refs/heads/main/Caroni%20Swamp.geojson" },
  { name: "Forest Reserve", url: "https://raw.githubusercontent.com/MGunnesslal/leaflet-geojson-layers/refs/heads/main/Forest%20Reserves.geojson" },
  { name: "Matura National Park (Buffer)", url: "https://raw.githubusercontent.com/MGunnesslal/leaflet-geojson-layers/refs/heads/main/Matura%20National%20Park%20Buffer.geojson" },
  { name: "Matura National Park", url: "https://raw.githubusercontent.com/MGunnesslal/leaflet-geojson-layers/refs/heads/main/Matura%20National%20Park.geojson" },
  { name: "Municipality", url: "https://raw.githubusercontent.com/MGunnesslal/leaflet-geojson-layers/refs/heads/main/Municipality.geojson" },
  { name: "Nariva Swamp (Buffer)", url: "https://raw.githubusercontent.com/MGunnesslal/leaflet-geojson-layers/refs/heads/main/Nariva%20Swamp%20Buffer.geojson" },
  { name: "Nariva Swamp", url: "https://raw.githubusercontent.com/MGunnesslal/leaflet-geojson-layers/refs/heads/main/Nariva%20Swamp.geojson" },
  { name: "Tobago Watersheds", url: "https://raw.githubusercontent.com/MGunnesslal/leaflet-geojson-layers/refs/heads/main/Tobago%20Watersheds.geojson" },
  { name: "Trinidad Watersheds", url: "https://raw.githubusercontent.com/MGunnesslal/leaflet-geojson-layers/refs/heads/main/Trinidad%20Watersheds.geojson" },
  { name: "Ecological Susceptibility", url: "https://raw.githubusercontent.com/MGunnesslal/leaflet-geojson-layers/refs/heads/main/Ecological%20Susceptibility.geojson" },
  { name: "Geological Susceptibility", url: "https://raw.githubusercontent.com/MGunnesslal/leaflet-geojson-layers/refs/heads/main/Geological%20Susceptibility.geojson" },
  { name: "Hydrogeology", url: "https://raw.githubusercontent.com/MGunnesslal/leaflet-geojson-layers/refs/heads/main/Hydrogeology.geojson" },
  { name: "Social Susceptibility", url: "https://raw.githubusercontent.com/MGunnesslal/leaflet-geojson-layers/refs/heads/main/Social%20Susceptibility.geojson" },
  { name: "Tobago TCPD Policy", url: "https://raw.githubusercontent.com/MGunnesslal/leaflet-geojson-layers/refs/heads/main/Tobago%20TCPD%20Policy.geojson" },
  { name: "Trinidad TCPD Policy", url: "https://raw.githubusercontent.com/MGunnesslal/leaflet-geojson-layers/refs/heads/main/Trinidad%20TCPD%20Policy.geojson" },
  { name: "Waterways", url: "https://raw.githubusercontent.com/MGunnesslal/leaflet-geojson-layers/refs/heads/main/Waterways.geojson" },
  //{ name: "Major Roads", url: "https://raw.githubusercontent.com/MGunnesslal/leaflet-geojson-layers/refs/heads/main/Major%20Roads.geojson" }
];

//-----------------------------------
// Links to metadata files for layers
//-----------------------------------

const layerInfoLinks = {
  "Aripo Savannas": "https://drive.google.com/file/d/1P3yIDzSHwJcM4Imvm5Am-5oOaHe_Ronu/view?usp=drive_link",
  "Caroni Swamp": "https://drive.google.com/file/d/1z37wlyEeJuXSk1N5sx1G3koweFpujHrs/view?usp=drive_link",
  "Forest Reserve": "https://drive.google.com/file/d/1rhdQPFfdhvHpYQl8TN5RgJ16SQelMOP9/view?usp=drive_link",
  "Matura National Park": "https://drive.google.com/file/d/1H0VDAgxH4CLgtIKQ2TD4QJ1a0UxrOMY0/view?usp=drive_link",
  "Municipality": "https://drive.google.com/file/d/19--aDF7Q2rsx0jRN7LfnKHNBEiHrx8A-/view?usp=drive_link",
  "Nariva Swamp": "https://drive.google.com/file/d/13BDSAFU7Qs15-u2YivDFq1ROSgaJQrYS/view?usp=drive_link",
  "Tobago Watersheds": "https://drive.google.com/file/d/1i7fmO0UjjJhJ0w5ufhCZVOXMN6NZNrxe/view?usp=drive_link",
  "Trinidad Watersheds": "https://drive.google.com/file/d/1l9dXsmtecxBD_abEpj1sM3wDVN6_O51L/view?usp=drive_link",
  "Ecological Susceptibility": "https://drive.google.com/file/d/1_H6wEto7ht44rur9SIng2W7d6CkRr9aq/view?usp=drive_link",
  "Geological Susceptibility": "https://drive.google.com/file/d/1RLennVCE2-V34DZdDI_GqoWL0kV2H1eb/view?usp=drive_link",
  "Hydrogeology": "https://drive.google.com/file/d/1njCS4VEy0iaJYln1uh2s3TSa9I_xdlMd/view?usp=drive_link",
  "Social Susceptibility": "https://drive.google.com/file/d/11B-UrWT-_jUHYe3_gDnLmIxLj5CDgSGx/view?usp=drive_link",
  "Tobago TCPD Policy": "https://drive.google.com/file/d/1Rr_DDeLBbDdRrlobAysHyw_fLNd5bTFb/view?usp=drive_link",
  "Trinidad TCPD Policy": "https://drive.google.com/file/d/1qXAAZb5-lUhmMo-WAvjQqOMkFlpyWymG/view?usp=drive_link",
  "Waterways": "https://drive.google.com/file/d/1_EV_J2SPb9YGjIL3nJ_iQSrbnsgFDDX2/view?usp=drive_link"
};

const layersRequiredForAnalysis = [
  "Caroni Swamp",
  "Aripo Savannas",
  "Forest Reserve",
  "Matura National Park",
  "Nariva Swamp",
  "Municipality",
  "Trinidad Watersheds",
  "Tobago Watersheds",
  "Ecological Susceptibility",
  "Geological Susceptibility",
  "Social Susceptibility",
  "Hydrogeology",
  "Trinidad TCPD Policy",
  "Tobago TCPD Policy"
];
preloadSpatialLayers();

const receptorLayers = [
  "Forest Reserve",
  "Caroni Swamp",
  "Aripo Savannas",
  "Matura National Park",
  "Nariva Swamp",
  "Waterways"
];

const styledGoldOrange = [
  "Aripo Savannas", "Aripo Savannas (Buffer)", "Caroni Swamp",
  "Matura National Park (Buffer)", "Matura National Park",
  "Nariva Swamp", "Nariva Swamp (Buffer)"
];

const labelFields = {
  "Forest Reserve": "NAME",
  "Municipality": "NAME_1",
  "Tobago Watersheds": "WATERSHED",
  "Trinidad Watersheds": "NAME",
  "Ecological Susceptibility": "Class",
  "Geological Susceptibility": "Class",
  "Hydrogeology": "ATTRIB",
  "Social Susceptibility": "Class",
  "Tobago TCPD Policy": "Class_Name",
  "Trinidad TCPD Policy": "Class_Name",
  "Waterways": "name"
};

const legendLayers = [
  "Ecological Susceptibility",
  "Geological Susceptibility",
  "Social Susceptibility",
  "Hydrogeology",
  //"Tobago Watersheds",
  //"Trinidad Watersheds"
];


const categoryColors = {};
const activeLegends = {};
const layerListContainer = document.getElementById("geojsonLayerList");

function getColor(category) {
  if (!categoryColors[category]) {
    const hue = Object.keys(categoryColors).length * 47 % 360;
    const light = `hsl(${hue}, 90%, 75%)`;
    const dark = `hsl(${hue}, 90%, 35%)`;
    categoryColors[category] = { light, dark };
  }
  return categoryColors[category];
}

function createLegend(name, values) {
  const legend = L.control({ position: 'bottomright' });
  legend.onAdd = function () {
    const div = L.DomUtil.create('div', 'custom-legend collapsed');
    div.id = `legend-${name.replace(/\s+/g, '-')}`;
    div.innerHTML = `<div class="legend-toggle">▼ ${name}</div><div class="legend-content">` +
      values.map(val => {
        const { light, dark } = getColor(val);
        return `<div class="legend-item"><span style="background:${light}; border:1px solid ${dark}"></span> ${val}</div>`;
      }).join('') + `</div>`;
    return div;
  };
  legend.addTo(map);
  activeLegends[name] = legend;
}

function removeLegend(name) {
  if (activeLegends[name]) {
    activeLegends[name].remove();
    delete activeLegends[name];
  }
}

document.addEventListener("click", function (e) {
  if (e.target.classList.contains("legend-toggle")) {
    const content = e.target.nextElementSibling;
    content.classList.toggle("expanded");
  }
});

// Load and manage each GeoJSON file
geojsonFiles.forEach(({ name, url }) => {
  // Create UI containers for layer toggles and opacity sliders
  const container = document.createElement("div");
  container.className = "geojson-layer";

  const label = document.createElement("label");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.dataset.layer = name;
  checkbox.className = "layer-toggle";
  label.appendChild(checkbox);
  label.append(" ", name);
  	if (layerInfoLinks[name]) {
		const infoIcon = document.createElement("sup");
		infoIcon.innerHTML = `<a href="${layerInfoLinks[name]}" target="_blank" title="More info" style="text-decoration: none; margin-left: 4px;">&#9432;</a>`;
		label.appendChild(infoIcon);
	}
  container.appendChild(label);

  const controls = document.createElement("div");
  controls.style.display = "flex";
  controls.style.alignItems = "center";
  controls.style.gap = "8px";
  controls.style.marginTop = "4px";

  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = 10;
  slider.max = 100;
  slider.step = 10;
  slider.value = 100;
  slider.className = "opacity-slider";
  slider.style.width = "90%";
  slider.dataset.layer = name;
  controls.appendChild(slider);

  container.appendChild(controls);
  layerListContainer.appendChild(container);

  // Fetch and store layer once when checkbox is toggled on
checkbox.addEventListener("change", () => {
  if (checkbox.checked) {
    // If layer is already preloaded for spatial analysis, just add it to the map
    if (geojsonLayers[name]) {
  const layer = geojsonLayers[name];
  const labelField = labelFields[name];

  layer.eachLayer(featureLayer => {
    const props = featureLayer.feature.properties;
    const value = labelField ? props[labelField] : name;

    let newStyle;
    if (styledGoldOrange.includes(name)) {
      newStyle = {
        color: '#8B2500',
        weight: 2,
        fillColor: '#DAA520',
        fillOpacity: slider.value / 100,
        opacity: slider.value / 100
      };
    } else if (name === "Major Roads") {
      newStyle = {
        color: "#ffffff",
        weight: 2,
        opacity: slider.value / 100
      };
    } else if (name === "Waterways") {
      newStyle = {
        color: "#4ba0ad",
        weight: 6,
        opacity: slider.value / 100
      };
    } else {
      const { light, dark } = getColor(value);
      newStyle = {
        color: dark,
        weight: 1.5,
        fillColor: light,
        fillOpacity: slider.value / 100,
        opacity: slider.value / 100
      };
    }

    featureLayer.setStyle(newStyle);
  });

  map.addLayer(layer);
  
  // Add legend even if layer was preloaded
if (legendLayers.includes(name)) {
  const labelField = labelFields[name];
  const features = layer.toGeoJSON().features;
  const categories = [...new Set(features.map(f => f.properties[labelField]).filter(v => !!v))];
  createLegend(name, categories);
}

	}
 else {
      // Otherwise, fetch and build the layer
      fetch(url)
        .then(res => res.json())
        .then(data => {
          const labelField = labelFields[name];
          const layer = L.geoJSON(data, {
            style: feature => {
              const value = labelField ? feature.properties[labelField] : name;
              if (styledGoldOrange.includes(name)) {
                return {
                  color: '#8B2500',
                  weight: 2,
                  fillColor: '#DAA520',
                  fillOpacity: slider.value / 100,
                  opacity: slider.value / 100
                };
              } else if (name === "Major Roads") {
                return { color: "#ffffff", weight: 2, opacity: slider.value / 100 };
              } else if (name === "Waterways") {
                return { color: "#4ba0ad", weight: 6, opacity: slider.value / 100 };
              } else {
                const { light, dark } = getColor(value);
                return {
                  color: dark,
                  weight: 1.5,
                  fillColor: light,
                  fillOpacity: slider.value / 100,
                  opacity: slider.value / 100
                };
              }
            },
            onEachFeature: (feature, layer) => {
              const value = labelField ? feature.properties[labelField] : name;
              if (value && value !== "null") {
                layer.on('click', e => {
                  layer.bindPopup(`<strong>${value}</strong>`).openPopup(e.latlng);
                });
              }
            }
          });

          geojsonLayers[name] = layer; // Store it for future use
          layer.addTo(map);

          if (legendLayers.includes(name)) {
            const categories = [...new Set(data.features.map(f => f.properties[labelField]).filter(v => !!v))];
            createLegend(name, categories);
          }
        });
    }
  } else {
    // Remove from map if toggled off
    if (geojsonLayers[name]) {
      map.removeLayer(geojsonLayers[name]);
      removeLegend(name);
    }
  }
});

  // Update opacity on slider input
  slider.addEventListener("input", () => {
    const layer = geojsonLayers[name];
    if (layer) {
      layer.eachLayer(featureLayer => {
        const props = featureLayer.feature.properties;
        const value = labelFields[name] ? props[labelFields[name]] : name;

        let newStyle;
        if (styledGoldOrange.includes(name)) {
          newStyle = {
            color: '#8B2500',
            weight: 2,
            fillColor: '#DAA520',
            fillOpacity: slider.value / 100,
            opacity: slider.value / 100
          };
        } else if (name === "Major Roads") {
          newStyle = {
            color: "#ffffff",
            weight: 2,
            opacity: slider.value / 100
          };
        } else {
          const { light, dark } = getColor(value);
          newStyle = {
            color: dark,
            weight: 1.5,
            fillColor: light,
            fillOpacity: slider.value / 100,
            opacity: slider.value / 100
          };
        }

        featureLayer.setStyle(newStyle);
      });
    }
  });
});

function preloadSpatialLayers() {
  geojsonFiles.forEach(({ name, url }) => {
    if (layersRequiredForAnalysis.includes(name)) {
      fetch(url)
        .then(res => res.json())
        .then(data => {
          const labelField = labelFields[name];
          const layer = L.geoJSON(data, {
            style: () => ({ weight: 1, color: "#999", fillOpacity: 0 }), // transparent base style
            onEachFeature: (feature, layer) => {
  const labelField = labelFields[name];
  const value = labelField ? feature.properties[labelField] : name;
  if (value && value !== "null") {
    layer.on('click', e => {
      layer.bindPopup(`<strong>${value}</strong>`).openPopup(e.latlng);
    });
  }
}

          });
          geojsonLayers[name] = layer; // Store it for spatial analysis
          // Not added to the map by default to reduce clutter
        });
    }
  });
}

//-------------------------------------------------------------------

// Global variables to hold roads layer and label group
let majorRoadsLayer = null;
let majorRoadsLabels = null;
let majorRoadsData = null;

// Function to control the visibility of the Major Roads layer
function updateMajorRoadsVisibility() {
  const currentZoom = map.getZoom();

  // Remove layers first to prevent duplication
  if (majorRoadsLayer) map.removeLayer(majorRoadsLayer);
  if (majorRoadsLabels) map.removeLayer(majorRoadsLabels);

  // Only render if zoom level is sufficient
  if (currentZoom >= 16 && majorRoadsData) {
    const visibleBounds = map.getBounds();

    majorRoadsLayer = L.geoJSON(majorRoadsData, {
      filter: feature => visibleBounds.intersects(L.geoJSON(feature).getBounds()),
      style: () => ({
        color: "#ffffff",
        weight: currentZoom >= 18 ? 8 : currentZoom >= 16 ? 6 : 4,
        opacity: 0.5
      })
    }).addTo(map);

    majorRoadsLabels = L.layerGroup();
    L.geoJSON(majorRoadsData, {
      filter: feature => visibleBounds.intersects(L.geoJSON(feature).getBounds()),
      onEachFeature: (feature, layer) => {
        if (feature.properties.name && currentZoom >= 17) {
          const center = layer.getBounds().getCenter();
          const label = L.marker(center, {
            icon: L.divIcon({
              className: 'road-label',
              html: feature.properties.name
            }),
            interactive: false
          });
          majorRoadsLabels.addLayer(label);
        }
      }
    });
    majorRoadsLabels.addTo(map);
  }
}

// Fetch Major Roads data once and cache it
fetch("https://raw.githubusercontent.com/MGunnesslal/leaflet-geojson-layers/refs/heads/main/Major%20Roads.geojson")
  .then(res => res.json())
  .then(data => {
    majorRoadsData = data;
    updateMajorRoadsVisibility();
  });

// Listen to zoom and move events to update road visibility
map.on("zoomend moveend", updateMajorRoadsVisibility);
map.whenReady(updateMajorRoadsVisibility);

//---------------------------------------------------------------------------------

// --------------------------------------------------
// Temporary Drawing Tools
// --------------------------------------------------
const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

const drawControlContainer = document.getElementById("drawTools");

const customDrawControl = new L.Control.Draw({
  draw: {
    polygon: {
      shapeOptions: {
        color: 'red',
        fillColor: 'red',
        fillOpacity: 0.5
      }
    },
    polyline: false,
    rectangle: {
      shapeOptions: {
        color: 'red',
        fillColor: 'red',
        fillOpacity: 0.5
      }
    },
    circle: false,
    marker: {
      icon: L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
      })
    },
    circlemarker: false
  },
  edit: {
    featureGroup: drawnItems,
    remove: true
  }
});

map.addControl(customDrawControl);

map.on("draw:created", function (e) {
  const layer = e.layer;

  // Prompt user for a name
  const name = prompt("Enter a name for this shape:", "");

  if (name && name.trim() !== "") {
    // Store name in GeoJSON-style properties
    layer.feature = layer.feature || { type: "Feature", properties: {} };
    layer.feature.properties.name = name;

    // Bind popup with name
    layer.bindPopup(`<strong>${name}</strong>`);
	//layer.openPopup();
  }

  drawnItems.addLayer(layer);
});

map.whenReady(() => {
  const drawToolbar = document.querySelector(".leaflet-draw");
  const editToolbar = document.querySelector(".leaflet-draw-edit-toolbar");

  if (drawToolbar && drawControlContainer) {
    drawControlContainer.appendChild(drawToolbar);
  }

  // Move edit toolbar next to the draw tools
  if (editToolbar && drawToolbar) {
    drawToolbar.appendChild(editToolbar);
  }
});

//---------------NSL INDEX----------------------------------------------------------------
// ===============================================
// NSL DA Selection: Modal Handling and Data Logic
// ===============================================

const designatedActivities = [
  { code: "1(a)", description: "The establishment, modification, expansion, decommissioning or abandonment (inclusive of associated works) of a poultry, cattle, pig or other livestock farm in excess of 1,000 heads of poultry or 250 heads of cattle, 250 heads of pigs or 250 heads of other livestock." },
  { code: "1(b)", description: "The establishment, modification, expansion, decommissioning or abandonment of a facility for the hatching, breeding or slaughtering of 1,000 heads of poultry, or 250 heads of cattle, 250 heads of pigs or 250 heads of other livestock, per year." },
  { code: "2", description: "The establishment, modification, expansion, and abandonment (inclusive of associated works) of a game propagating facility." },
  { code: "3", description: "The establishment, modification, expansion, decommissioning or abandonment (inclusive of associated works) of a facility for fish/shellfish processing and/or, a facility for fish/shellfish propagation with a total pond area of 2.5 hectares or more." },
  { code: "4", description: "The establishment, modification, expansion, or decommissioning (inclusive of associated works) of a horticultural farm of a total area of more than 2 hectares or a processing facility, with a production capacity of more than 20 kilograms per day." },
  { code: "5(a)", description: "The establishment of a timber plantation of more than one hectare or the expansion of an existing plantation by more than 2 hectares."},
  { code: "5(b)", description: "Logging or extraction (inclusive of associated works) in a timber plantation or in a forested area of 1 hectare or more during a five year period."},
  { code: "5(c)", description: " The establishment, modification, expansion, decommissioning or abandonment of a sawmill."},
  { code: "6", description: "The establishment, or expansion of a vegetable crop or fruit farm of an area in excess of 2 hectares during a two year period. "},
  { code: "7", description: "The establishment, modification, expansion, decommissioning or abandonment (inclusive of associated works) of an electricity generating plant with a capacity of 50 megawatts or greater."},
  { code: "8(a)", description: "The clearing , excavation, grading or land filling of an area of more than two hectares during a two year period."},
  { code: "8(b)", description: "The clearing of more than one half hectare of a forested area during a two year period."},
  { code: "8(c)", description: "The clearing , excavation, grading or land filling of any area with a gradient of 1:4 or more."},
  { code: "9", description: "The establishment of a paved area (inclusive of associated works) of more than 4,500 square metres during a two-year period."},
  { code: "10(a)", description: "The establishment, decommissioning or abandonment (inclusive of associated works) of the following facilities with a capacity for 500 or more persons including staff:\n(i) institutional facilities such as an educational facility, a hospital, a health centre, a nursing home,  a prison/correctional facility; and\n(ii) other facilities such as sporting complexes, shopping malls etc."},
  { code: "10(b)", description: "The modification or expansion  (inclusive of associated works) of the following facilities in order to cater for 500 or more persons including staff:\n(i) institutional facilities such as an educational facility, a hospital, a health centre, a nursing home, a prison/correctional facility; and\n(ii) other facilities such as sporting complexes, shopping malls etc."},
  { code: "11", description: "The establishment, modification, expansion, decommissioning or abandonment (inclusive of associated works) of: a hotel, inn, etc., with a capacity of 30 rooms or more."},
  { code: "12", description: "The reclamation of land (inclusive of associated works)."},
  { code: "13(a)", description: "The establishment, modification, expansion, decommissioning or abandonment (inclusive of associated works) of marinas, piers, slipways, jetties or other coastal features."},
  { code: "13(b)", description: "The establishment, modification, or expansion (inclusive of associated works) of artificial reefs or other offshore structures."},
  { code: "13(c)", description: "The dredging or cutting of coastal or marine areas."},
  { code: "14(a)", description: "The establishment, modification, expansion, decommissioning or abandonment (inclusive of associated works) of a facility for the processing, canning, bottling or packaging of meats or fish (and their associated products)"},
  { code: "14(b)", description: "The establishment modification, expansion, decommissioning or abandonment (inclusive of associated works) of a facility for the processing, canning, bottling or packaging of 10 tonnes per year or more of the following: dairy products; margarines or vegetable oils; fruits, vegetables; fruit or vegetable juices, jams, jellies, pastes or sauces; preserves - products, fruits or vegetables; pre cooked meats, fruits or meals; carbonated beverages; artificially flavoured beverages; coffee or coffee related products; cocoa or cocoa related products; sugar confectionery; baked products; spices, seasonings, flavouring extracts and other condiments."},
  { code: "15", description: "The establishment, modification, decommissioning, abandonment or expansion (inclusive of associated works) of a granary or grain mill."},
  { code: "16", description: "The establishment, modification, decommissioning, abandonment or expansion (inclusive of associated works) of a sugar manufacturing or refining facility."},
  { code: "17", description: "The establishment, modification, expansion, decommissioning or abandonment (inclusive of associated works) of a distillery, brewery or other facility for the manufacture of alcoholic beverages, wines and spirits."},
  { code: "18(a)", description: "The establishment, modification, expansion, decommissioning or abandonment (inclusive of associated works) of a plant for the manufacture of raw materials or products used in construction."},
  { code: "18(b)", description: "The establishment, modification, expansion, decommissioning or abandonment (inclusive of associated works) of a facility for the packaging/containment of asphalt and cement. "},
  { code: "19", description: "The establishment, modification, expansion, decommissioning or abandonment (inclusive of associated works) of a facility for the manufacture of petrochemicals; petrochemical products; petroleum products, including asphalt or bitumen."},
  { code: "20(a)", description: "The establishment, modification, expansion, decommissioning or abandonment (inclusive of associated works), of a chemical manufacturing plant."},
  { code: "20(b)", description: "The establishment (inclusive of associated works) modification or abandonment of an industrial gas production, processing, compression or liquefaction plant."},
  { code: "20(c)", description: "The establishment, modification, expansion, decommissioning or abandonment (inclusive of associated works) of a facility for the manufacture or assembly of: paints, coatings or allied products; pharmaceutical or  cosmetic products; household products; personal hygiene products; textiles; fibres or fibre products; dyes; inks; wearing apparel; paper or paper products; furniture or household fixtures; plastic or plastic products; rubber products; batteries or associated components; automobiles; automotive spare parts or components; adhesives or adhesive products polymers or polymer products ; glass or associated products; appliances or components; electrical  products or components; asbestos or asbestos containing products; or leather."},
  { code: "20(d)", description: "The establishment, modification, expansion, decommissioning or abandonment (inclusive of associated works) of a facility for printing and packaging."},
  { code: "21", description: "The establishment, modification, expansion, decommissioning or abandonment (inclusive of associated works) of a facility for the production or reforming of metals or related products (including lead recovery from batteries)."},
  { code: "22", description: "The establishment, modification, expansion, decommissioning or abandonment (inclusive of associated works) of a facility for the extraction, or processing or storage of metal ore. "},
  { code: "23", description: "The establishment, modification, expansion, decommissioning or abandonment (inclusive of associated works) of a facility for the mining, processing or storage of clay, andesite, porcellanite, limestone, oil sand, sand(s), gravel or other non-metallic minerals."},
  { code: "24", description: "The conduct of all works related to the exploration of oil and natural gas"},
  { code: "25", description: "The establishment, modification, expansion, decommissioning or abandonment (inclusive of associated works) of a facility for the extraction or production of crude oil or production of associated gas or condensates."},
  { code: "26(a)", description: "The establishment, modification, expansion, decommissioning or abandonment (inclusive of associated works) of a facility for natural gas or condensate production."},
  { code: "26(b)", description: "The establishment, modification, expansion, decommissioning or abandonment (inclusive of associated works) of a natural gas compression, blending or liquefaction facility."},
  { code: "27", description: "The establishment, modification or expansion (inclusive of associated works) of a pipeline or pipeline systems for transmission of produced fluids, crude oil or natural gas."},
  { code: "28", description: "The establishment, modification, expansion, decommissioning or abandonment (inclusive of associated works) of crude oil refinery."},
  { code: "29", description: "The installation, expansion, decommissioning or abandonment (inclusive of associated works) of a storage facility with a gross capacity of more than 500 barrels."},
  { code: "30", description: "The establishment, modification, expansion, decommissioning or abandonment (inclusive of associated works) of satellite to earth stations for the purpose of rendering communication services to the public."},
  { code: "31(a)", description: "The establishment, modification, expansion, decommissioning or abandonment (inclusive of associated works) of a park, nature trail, board walk or other recreational facility supporting a potential visitor use of 500 or more individuals per day."},
  { code: "31(b)", description: "The establishment, modification, expansion, decommissioning or abandonment (inclusive of associated works) of a golf course."},
  { code: "32", description: "The establishment, modification, expansion, decommissioning or abandonment (inclusive of associated works) of an airport, heliport, aerodrome or landing strip."},
  { code: "33(a)", description: "The establishment (inclusive of associated works) of a road of more than 1 kilometre in length."},
  { code: "33(b)", description: "The extension/expansion (inclusive of associated works) of a road by more than 1 kilometre or by 35% or more of its length or width."},
  { code: "34", description: "The establishment, modification, expansion, decommissioning or abandonment (inclusive of associated works) of a marine terminal, harbour/port or facilities for dry-docking or ship repair or construction."},
  { code: "35", description: "The establishment, modification, expansion, decommissioning or abandonment of a solid waste disposal facility inclusive of the disposal of industrial waste, aircraft and ship generated waste."},
  { code: "36", description: "The establishment, modification, expansion, decommissioning or abandonment of a facility for handling, storage, treatment or disposal of hazardous substances."},
  { code: "37", description: "The establishment, modification, expansion, decommissioning or abandonment (inclusive of associated works) of a facility for the recovery or recycling or incineration of waste."},
  { code: "38(a)", description: "The establishment, modification, expansion, decommissioning or abandonment (inclusive of associated works) of a facility for the catchment, abstraction or treatment for distribution of potable or process water."},
  { code: "38(b)", description: "The establishment, modification, decommissioning or abandonment of water wells or other infrastructure (inclusive of associated works) to make available potable or process water. "},
  { code: "38(c)", description: "The establishment, modification, expansion, decommissioning or abandonment of a desalination plant."},
  { code: "39", description: "The establishment, modification, expansion, decommissioning or abandonment (inclusive of associated works) of surface impoundments, dams or reservoirs for storage of water."},
  { code: "40(a)", description: "The establishment, modification, expansion, decommissioning or abandonment (inclusive of associated works) of pipeline distribution systems for the delivery of potable, process water or sewage."},
  { code: "40(b)", description: "The laying of water and sewage mains (inclusive of associated works) along an existing or a new right of way for distances of more than 1 kilometre during a two year period."},
  { code: "41(a)", description: "The establishment, modification or expansion (inclusive of associated works) of a land drainage or irrigation scheme for a parcel of land of more than 1 hectare during a two year period."},
  { code: "41(b)", description: "The establishment of a flood control system or a water supply impoundment for a parcel of land of more than 1 hectare during a two year period."},
  { code: "41(c)", description: " The realignment or modification of drainage or river systems."},
  { code: "42", description: "The establishment, modification, expansion, decommissioning or abandonment (inclusive of associated works) of a waste water or sewage treatment facility."},
  { code: "43(a)", description: " The establishment, modification expansion, decommissioning or abandonment (inclusive of associated works) of an automotive repair garage, auto body shops, gasoline/service stations or vehicle inspection stations. "},
  { code: "43(b)", description: "The establishment, modification expansion, decommissioning or abandonment of a laundry (wet or dry cleaning)."},
  { code: "43(c)", description: "The establishment, modification, decommissioning or abandonment (inclusive of associated works) of a commercial kitchen with a water consumption of 9 cubic metres or more per day."},
  { code: "43(d)", description: "The establishment, modification, expansion, decommissioning or abandonment (inclusive of associated works) of chemical or medical or other scientific research laboratories. Not likely needed."},
  { code: "44(a)", description: "The establishment, modification, expansion, decommissioning or abandonment (inclusive of associated works) of burial grounds for human remains with an area of 500 square metres or more."},
  { code: "44(b)", description: "The establishment, modification, expansion, decommissioning or abandonment (inclusive of associated works) of crematoria or pyre sites for human remains."},
];

const riskDefinitions = {
  "1(a)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.\nLow - Rearing of broilers or layers, open grazing of sheep, goats, rabbit, cattle or other livestock\nModerate - Rearing of ducks, cage farming of sheep, goats, rabbit or other livestock\nHigh - Pigs.\nVery High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A - < 250 heads of poultry or 25 heads of livestock.\nVery Low - 250 to 19,999 heads poultry; 25 to 499 heads livestock\nLow - 20,000 - 100,000 poultry; 500 - 4,499 heads livestock\nModerate - 100,000 - 499,999 heads poultry, 5,000 - 14,999 heads livestock\nHigh - \u2264 500,000 heads poultry; 15,000 heads livestock\nVery High - None.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;\nVery Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;\nHigh is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;\nVery High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "1(b)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.\nLow - Hatching.\nModerate - Breeding.\nHigh - Slaughtering.\nVery High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A - < 250 heads poultry or 25 heads livestock.\nVery Low - 19,999 eggs or slaughter of 250 - 499 heads/week poultry or 25 - 49 heads/week livestock.\nLow - 20,000 - 99,999 eggs or slaughter of 500 to 999 heads/week poultry or 50 - 99 heads livestock.\nModerate - 100,000 to 499,999 eggs or slaughter of 1,000 - 4,999 heads per week poultry or 100 - 2,499 heads livestock.\nHigh - \u2264 500,000 eggs, 5,000 heads/week poultry or 2,500 heads/week livestock.\nVery High - None.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;\nVery Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;\nHigh is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;\nVery High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "2": {
    "NatureDefinition": "Specific definitions for the Nature risk category is not yet developed for this Designated Activity. Officers should consider of the number of activities in the scope of work, and environmental hazards that may arise from these activities.\n",
    "ScaleDefinition": "Specific definitions for the Scale category is not yet developed for this Designated Activity. Officers should consider the potential area of impact of the activities to the extent that:\nN/A is \u2264 0.0465 ha; \nVery Low is \u2264 1 ha; \nLow is \u2264 2 ha; \nModerate is \u2264 5 ha; \nHigh is \u2264 10 ha; \nVery High > 10 ha.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;\nVery Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors e.g. agricultural etc.;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;\nHigh is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;\nVery High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "3": {
    "NatureDefinition": "Specific definitions for the Nature risk category is not yet developed for this Designated Activity. Officers should consider of the number of activities in the scope of work, and environmental hazards that may arise from these activities.\n",
    "ScaleDefinition": "Specific definitions for the Scale category is not yet developed for this Designated Activity. Officers should consider the potential area of impact of the activities to the extent that:\nN/A is \u2264 0.0465 ha; \nVery Low is \u2264 1 ha; \nLow is \u2264 2 ha; \nModerate is \u2264 5 ha; \nHigh is \u2264 10 ha; \nVery High > 10 ha.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;\nVery Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors e.g. agricultural etc.;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;\nHigh is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;\nVery High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "4": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.\nLow - All Horticultural farming.\nModerate - None.\nHigh - None.\nVery High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A is \u2264 2 ha; \nVery Low - 2 - 9.9 ha;\nLow - 10 - 29.9 ha;\nModerate - 30 - 100 ha;\nHigh is \u2264 100 ha;\nVery High > N/A.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;\nVery Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors e.g. agricultural etc.;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;\nHigh is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;\nVery High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "5(a)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.\nLow - All establishment/expansion of timber plantation.\nModerate - None.\nHigh - None.\nVery High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A is \u2264 2 ha; \nVery Low - 2 - 9.9 ha;\nLow - 10 - 29.9 ha;\nModerate - 30 - 100 ha;\nHigh is \u2264 100 ha;\nVery High > N/A.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;\nVery Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;\nHigh is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;\nVery High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "5(b)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.\nLow - None.\nModerate - Logging/extraction.\nHigh - None.\nVery High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A is \u2264 2 ha; \nVery Low - 2 - 9.9 ha;\nLow - 10 - 29.9 ha;\nModerate - 30 - 100 ha;\nHigh is \u2264 100 ha;\nVery High > N/A.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;\nVery Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;\nHigh is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;\nVery High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "5(c)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.\nLow - Not including treatment of wood;\nModerate - Including treatment of wood;\nHigh - None.\nVery High - None.",
    "ScaleDefinition": "Specific definitions for the Scale category is not yet developed for this Designated Activity. Officers should consider the potential area of impact of the activities to the extent that:\nN/A is \u2264 0.0465 ha; \nVery Low is \u2264 1 ha; \nLow is \u2264 2 ha; \nModerate is \u2264 5 ha; \nHigh is \u2264 10 ha; \nVery High > 10 ha.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;\nVery Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;\nHigh is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;\nVery High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "6": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.\nLow - All crop farming.\nModerate - None.\nHigh - None.\nVery High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A is \u2264 2 ha; \nVery Low - 2 - 9.9 ha;\nLow - 10 - 29.9 ha;\nModerate - 30 - 100 ha;\nHigh is \u2264 100 ha;\nVery High - N/A.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;\nVery Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;\nHigh is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;\nVery High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "7": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.                                                                                                                    \nLow - Solar farms.\nModerate - Wind turbines. Decommissioning of renewable energy plants (solar/wind).\nHigh - Establishment (gas, combined cycle, diesel),decommissioning of non-renewable energy plants (gas, combined cycle etc.)                                                                                                                       \nVery High - Decommissioning non-renewable energy plants (diesel)",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A - < 49.9 MW\nVery Low - 50 - 74.9 MW\nLow - 75 - 99.9 MW\nModerate - 100 - 149.9 MW                                                                                                    \nHigh - 150 MW -299.9 MW\nVery High < 300 MW",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            \nVery Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         \nHigh is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   \nVery High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "8(a)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - Grubbing, cutting of grass.\nVery Low - None.                                                                                                                    \nLow - Clearing, grading, filling.\nModerate - Cutting, excavation\nHigh - None.                                                                                                                        \nVery High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A is \u2264 2 ha; \nVery Low - 2 - 4.9 ha clearing/grading/filling;\nLow -  5 - 14.9 ha clearing/grading/filling\nModerate - 15 - 49.9 ha clearing/grading/filling; 2 - 4.9 ha cutting/excavation;\nHigh is - 50 - 99.9 ha clearing/grading/filling; 5 - 19.9 ha cutting/excavation;\nVery High > 100 ha clearing/grading/filling; 20 ha cutting/excavation.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            \nVery Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         \nHigh is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   \nVery High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "8(b)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.                                                                                                                    \nLow - None.\nModerate - Secondary forest.\nHigh - Primary forest                                                                                                                  \nVery High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A is \u2264 0.5 ha; \nVery Low - 0.5 - 4.9 ha;\nLow - 5 - 14.9 ha;\nModerate - 15 - 29.9 ha;\nHigh - 30 - 49.9 ha;\nVery High > 50 ha.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            \nVery Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         \nHigh is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   \nVery High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "8(c)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.                                                                                                                    \nLow - Filling.\nModerate - Clearing, grading.\nHigh - Cutting, excavation.                                                                                                            \nVery High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A - None\nVery Low - None.\nLow - None.\nModerate - At any level.\nHigh - None.\nVery High - None",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            \nVery Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         \nHigh is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   \nVery High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "9": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.                                                                                                                    \nLow - Paving\nModerate - None.\nHigh - None.                                                                                                                          \nVery High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A - < 4,500 m2;\nVery Low - 4,501 m2 - 99,999 m2 (9.99 ha);\nLow - 10 - 29.9 ha;\nModerate - 30 - 49.9 ha; \nHigh - 50 - 149.9 ha \nVery High \u2265 150 ha",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            \nVery Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         \nHigh is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   \nVery High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "10(a)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - Playlot, School \u2013 daycare/nursery school/ECCE.\nLow - Neighborhood Strip mall - retail, Entertainment center \u2013 indoor, Cinema \u2013 indoor, Medical facility - primary, School \u2013 primary, Church/religious institution, Library.\nModerate - Sub-regional Shopping mall/center - neighborhood, Entertainment center \u2013 outdoor, Cinema - outdoor, Strip mall \u2013 retail & services, Medical, facility - secondary, School \u2013 secondary/tertiary, Prison/correctional facility, decommissioning of institutional facility.\nHigh - Regional & National Shopping mall/center - regional, Medical facility - tertiary, nursing home.                                                                                                                                                    \nVery High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A is \u2264 499 persons;\nVery Low - 500 - 1000 persons;\nLow - 1,000 - 2,499 persons;\nModerate - 2,500 - 4,999 persons\nHigh is < 5,000 persons;\nVery High - None.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            \nVery Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         \nHigh is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   \nVery High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "10(b)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - Playlot, School \u2013 daycare/nursery school/ECCE.                                                                                                                  \nLow - Neighborhood Strip mall - retail, Entertainment center \u2013 indoor, Cinema \u2013 indoor, Medical facility - primary, School \u2013 primary, Church/religious institution, Library.\nModerate - Sub-regional Shopping mall/center - neighborhood, Entertainment center \u2013 outdoor, Cinema - outdoor, Strip mall \u2013 retail & services, Medical, facility - secondary, School \u2013 secondary/tertiary, Prison/correctional facility, decommissioning of institutional facility.\nHigh - Regional & National Shopping mall/center - regional, Medical facility - tertiary, nursing home.                                                                                                                                                    \nVery High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A is \u2264 499 persons;\nVery Low - 500 - 1000 persons;\nLow - 1,000 - 2,499 persons;\nModerate - 2,500 - 4,999 persons\nHigh is < 5,000 persons;\nVery High - None.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            \nVery Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         \nHigh is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   \nVery High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "11": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.                                                                                                                    \nLow - Accomodation only.\nModerate - Accomodation, entertainment, event services.\nHigh - None.                                                                                                                        \nVery High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A is \u2264 29 rooms;\nVery Low - 30 - 49 rooms;\nLow - 50 - 99 rooms;\nModerate - 100 - 999 rooms;\nHigh - 1,000 - 2,999 rooms;\nVery High < 3,000 rooms.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            \nVery Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         \nHigh is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   \nVery High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "12": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.                                                                                                                    \nLow - None\nModerate - None\nHigh - Reclamation of land \u2013 coastal                                                                                                                    \nVery High - Reclamation of land \u2013 offshore (island)\nBeach restoration",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A is \u2264 0.0465 ha; \nVery Low is \u2264 1 ha; \nLow is \u2264 2 ha; \nModerate is \u2264 5 ha; \nHigh is \u2264 10 ha; \nVery High > 10 ha.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            \nVery Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         \nHigh is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   \nVery High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "13(a)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.                                                                                                                    \nLow - Demolition of existing structure\nModerate - Soft engineering\nHigh - Hard engineering                                                                                                            \nVery High - None.\n",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A - None\nVery Low is \u2264 0.045 ha; \nLow - 0.05 - 0.49 ha;\nModerate - 0.5 - 0.9 ha;                                                                                                     High 1 - 4.9 ha;\nVery High \u2265 5 ha.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            \nVery Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         \nHigh is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   \nVery High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "13(b)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.                                                                                                                    \nLow - None\nModerate -  Underwater structure \u2013 art installation\nHigh - Breakwater, Mariculture                                                                                                         \nVery High - Hydropower turbines\n",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A - None\nVery Low is \u2264 0.045 ha; \nLow - 0.05 - 0.49 ha;\nModerate - 0.5 - 0.9 ha;                                                                                                     High 1 - 4.9 ha;\nVery High \u2265 5 ha.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            \nVery Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         \nHigh is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   \nVery High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "13(c)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.                                                                                                                    \nLow - Dredging - maintenance\nModerate -  None\nHigh - Dredging \u2013 primary/capital                                                                                                   Very High - None\n",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A - None\nVery Low is \u2264 0.045 ha, 0.49 m or 999 m3;\nLow - 0.05 - 0.49 ha, 0.5 - 2.9 m or 1,000 - 9,999 m3;\nModerate - 0.5 - 0.9 ha, 3 - 9.9 m or 10,000 - 49,999 m3;                                                                                                     \nHigh 1 - 4.9 ha, 10 - 24.9 m or 50,000 - 99,999 m3;\nVery High \u2265 5 ha, \u2265 25 m or \u2265 100,000 m3",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            \nVery Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         \nHigh is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   \nVery High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "14(a)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.                                                                                                                    \nLow - None.\nModerate - Meat & fish processing, canning, bottling, packaging\nHigh - None.                                                                                                                        \nVery High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A is None                                                                                                                          \nVery Low < 24.9 tonnes/year;\nLow - 25 - 49.9 tonnes/year \nModerate - 50 - 299.9 tonnes/year; \nHigh < 300 tonnes/year;                                                                                                         \nVery High - None.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            \nVery Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         \nHigh is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   \nVery High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "14(b)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.                                                                                                                    \nLow - Fruits, vegetables\nModerate - Milk pasteurization, Dairy products, Margarines or vegetable oils\nHigh - None.                                                                                                                        \nVery High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A is \u2264 9.9 tonnes/year\nVery Low - 10 - 49.9 tonnes/year;\nLow - 50 - 99.9 tonnes/year \nModerate - 100 - 500 tonnes/year; \nHigh - < 500 tonnes/year                                                                                                         \nVery High - None.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            \nVery Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         \nHigh is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   \nVery High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "15": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.                                                                                                                    \nLow - None.\nModerate - Animal feed, flour, rice.\nHigh - None.                                                                                                                        \nVery High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A is None\nVery Low < 24.9 tonnes/year;\nLow - 25 - 49.9 tonnes/year \nModerate - 50 - 299.9 tonnes/year; \nHigh < 300 tonnes/year;                                                                                                         \nVery High - None.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            \nVery Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         \nHigh is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   \nVery High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "16": {
    "NatureDefinition": "Specific definitions for the Nature risk category is not yet developed for this Designated Activity. Officers should consider of the number of activities in the scope of work, and environmental hazards that may arise from these activities.\n",
    "ScaleDefinition": "Specific definitions for the Scale category is not yet developed for this Designated Activity. Officers should consider the potential area of impact of the activities to the extent that:\nN/A is \u2264 0.0465 ha; \nVery Low is \u2264 1 ha; \nLow is \u2264 2 ha; \nModerate is \u2264 5 ha; \nHigh is \u2264 10 ha; \nVery High > 10 ha.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            \nVery Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors e.g. industrial, commercial, agricultural etc.;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         \nHigh is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   \nVery High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "17": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.                                                                                                                    \nLow - Fermented alcohols\nModerate - Distilled alcohols\nHigh - None.                                                                                                                        \nVery High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A is None\nVery Low < 24.9 tonnes/year;\nLow - 25 - 49.9 tonnes/year \nModerate - 50 - 299.9 tonnes/year; \nHigh < 300 tonnes/year;                                                                                                         \nVery High - None.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            \nVery Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         \nHigh is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   \nVery High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "18(a)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.                                                                                                                    \nLow - Concrete batching plants (temporary), Concrete & clay products- enclosed, Asphalt products, Asphalt batching plant - temporary\nModerate - Concrete batching plants (permanent), Cement manufacture,\nConcrete & clay products- enclosed, Asphalt batching plant - permanent\nHigh - None.                                                                                                                        \nVery High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A is None\nVery Low < 24.9 tonnes/year;\nLow - 25 - 49.9 tonnes/year \nModerate - 50 - 299.9 tonnes/year; \nHigh < 300 tonnes/year;                                                                                                         \nVery High - None.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            \nVery Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         \nHigh is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   \nVery High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "18(b)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.                                                                                                                    \nLow - Packaging of construction materials (Cement, Asphalt)\nModerate - None.\nHigh - None.                                                                                                                        \nVery High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A is None\nVery Low < 24.9 tonnes/year;\nLow - 25 - 49.9 tonnes/year \nModerate - 50 - 299.9 tonnes/year; \nHigh < 300 tonnes/year;                                                                                                         \nVery High - None.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            \nVery Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "19": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.                                                                                                                    Low - Mobile asphalt batching plant\nModerate - Asphalt emulsion, on-site asphalt batching plant\nHigh - Methanol, Ammonia, Urea, Fertilizer, Nitric acid, Ammonium nitrate, Ethylene, Di-methyl ether, Formaldehye and formaldehyde products, Melamine Very High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A is None\nVery Low < 24.9 tonnes/year;\nLow - 25 - 49.9 tonnes/year \nModerate - 50 - 299.9 tonnes/year; \nHigh - 300 - 999.9 tonnes/year                                                                                                     Very High < 1,000 tonnes/year.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "20(a)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.                                                                                                                    Low -Food acidulants, Biodiesel/biofuels\nModerate - Ethanol manufacture, Sodium hydroxide, Sulphuric acid\nHigh - None.                                                                                                                        Very High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A is None\nVery Low < 24.9 tonnes/year;\nLow - 25 - 49.9 tonnes/year \nModerate - 50 - 299.9 tonnes/year; \nHigh - 300 - 999.9 tonnes/year                                                                                                     Very High < 1,000 tonnes/year.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "20(b)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.                                                                                                                    Low -None.\nModerate - Gas processing (fractionation, compression, dehydration)\nHigh - None.                                                                                                                        Very High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A is None\nVery Low < 24.9 tonnes/year;\nLow - 25 - 49.9 tonnes/year \nModerate - 50 - 299.9 tonnes/year; \nHigh - 300 - 999.9 tonnes/year                                                                                                     Very High < 1,000 tonnes/year.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "20(c)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.                                                                                                                    Low -Cosmetics, Household products, Fibre and fibre products, clothing, Plastics and plastic products, Polymer/polymer products, Glass and glass products, Appliances and components, Electrical supplies and components.\nModerate - Furniture (metal or wood) and household fixtures, Paints, coatings, allied products, Pharmaceuticals, Dyes and inks, textiles, Rubber and rubber products, Automobiles, automobile parts and components, Adhesives/adhesive products, Leather.\nHigh -Batteries and components.                                                                                                              Very High - Asbestos or asbestos containing products.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A is None\nVery Low < 24.9 tonnes/year;\nLow - 25 - 49.9 tonnes/year \nModerate - 50 - 299.9 tonnes/year; \nHigh - 300 - 999.9 tonnes/year                                                                                                     Very High < 1,000 tonnes/year.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "20(d)": {
    "NatureDefinition": "Specific definitions for the Nature risk category is not yet developed for this Designated Activity. Officers should consider of the number of activities in the scope of work, and environmental hazards that may arise from these activities.\n",
    "ScaleDefinition": "Specific definitions for the Scale category is not yet developed for this Designated Activity. Officers should consider the potential area of impact of the activities to the extent that:\nN/A is \u2264 0.0465 ha; \nVery Low is \u2264 1 ha; \nLow is \u2264 2 ha; \nModerate is \u2264 5 ha; \nHigh is \u2264 10 ha; \nVery High > 10 ha.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors e.g. industrial, commercial etc.;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "21": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.                                                                                                                    Low -Manufacture of steel products, Compaction of metals, Welding and fabrication\nModerate - Chrome plating, Manufacture of aluminum pots, Iron carbide plant, Manufacture of iron products\nHigh - Smelting of metals.                                                                                                              Very High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A is None\nVery Low < 24.9 tonnes/year;\nLow - 25 - 49.9 tonnes/year \nModerate - 50 - 299.9 tonnes/year; \nHigh - 300 - 999.9 tonnes/year                                                                                                     Very High < 1,000 tonnes/year.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "22": {
    "NatureDefinition": "Specific definitions for the Nature risk category is not yet developed for this Designated Activity. Officers should consider of the number of activities in the scope of work, and environmental hazards that may arise from these activities.\n",
    "ScaleDefinition": "Specific definitions for the Scale category is not yet developed for this Designated Activity. Officers should consider the potential area of impact of the activities to the extent that:\nN/A is \u2264 0.0465 ha; \nVery Low is \u2264 1 ha; \nLow is \u2264 2 ha; \nModerate is \u2264 5 ha; \nHigh is \u2264 10 ha; \nVery High > 10 ha.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors e.g. industrial, commercial etc.;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "23": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None                                                                                                      Low - Storage of coarse materials  \nModerate - Dry and/or wet processing\nHigh - Mining of unconsolidated materials \u2013 sand, gravel, clay, porcellanite, oilsand, storage of fine materials                                                                                                                       Very High - Mining of consolidated material - andesite, granite, limestone.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A - None.\nVery Low is \u2264 2 ha;\nLow is 2 - 9.9 ha;\nModerate 10 - 49.9 ha;\nHigh - 50 - 149.9 ha;\nVery High \u2265 150 ha.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "24": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - Borehole Sampling (on-shore), Seabed/Bathymetric Surveys.\nVery Low - Ground Penetrating Radar (on-shore), Vertical Sound Profiles (on-shore and off-shore), Geophysical without air-guns. \nLow - Non-impulsive energy sources such as Vibrosis Trucks (onshore), Geotechnical surveys (off-shore)\nModerate - geophysical with air-guns, 2D seismic, 3D seismic with streamer array, 3D seismic with Ocean Bottom Nodes, 4D seismic.\nHigh - Seismic (shot point/geophone) survey (onshore).\nVery High - Exploratory drilling (on-shore and off-shore)",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A - \u2264 0.0465 ha (on-shore), \u2264 0.1 sq. km (off-shore)\nVery Low - \u2264 1 ha (on-shore), \u2264 50 sq. km (off-shore)\nLow - \u2264 2 ha (on-shore) \u2264 100 sq. km (off-shore)\nModerate -\u2264 5 ha (on-shore), \u2264 500 sq. km (off-shore), 1 - 4 wells\nHigh - \u226410 ha (on-shore), \u2264 1000 sq. km (off-shore), 5 - 19 wells\nVery High - > 10 ha (on-shore), > 1000 sq. km (off-shore), \u2264 20 wells",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "25": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.                                                                                                                    Low -Abandonment, re-abandonment, decommissioning of inactive wells, Well completion, Modification of associated equipment\nModerate -Drilling \u2013 existing well (workover, infill), Gathering station (Primary treatment), Abandonment, re-abandonment, decommissioning of active wells, EOR \u2013 (CO2, waterflooding)\nHigh - Drilling \u2013 new wellsite (production, sidetrack)\nVery High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A - \u2264 0.0465 ha (on-shore), \u2264 0.1 sq. km (off-shore)\nVery Low - \u2264 1 ha (on-shore), \u2264 50 sq. km (off-shore)\nLow - \u2264 2 ha (on-shore) \u2264 100 sq. km (off-shore)\nModerate -\u2264 5 ha (on-shore), \u2264 500 sq. km (off-shore), 1 - 4 wells\nHigh - \u226410 ha (on-shore), \u2264 1000 sq. km (off-shore), 5 - 19 wells\nVery High - > 10 ha (on-shore), > 1000 sq. km (off-shore), \u2264 20 wells",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "26(a)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.                                                                                                                    Low -Abandonment, re-abandonment, decommissioning of inactive wells\nWell completion, Modification of associated equipment\nModerate -Drilling \u2013 existing well (workover, infill), Gathering station (Primary treatment), Abandonment, re-abandonment, decommissioning of active wells\nHigh - Natural gas processing plant\nVery High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A - \u2264 0.0465 ha (on-shore), \u2264 0.1 sq. km (off-shore)\nVery Low - \u2264 1 ha (on-shore), \u2264 50 sq. km (off-shore)\nLow - \u2264 2 ha (on-shore) \u2264 100 sq. km (off-shore)\nModerate -\u2264 5 ha (on-shore), \u2264 500 sq. km (off-shore), 1 - 4 wells\nHigh - \u226410 ha (on-shore), \u2264 1000 sq. km (off-shore), 5 - 19 wells\nVery High - > 10 ha (on-shore), > 1000 sq. km (off-shore), \u2264 20 wells",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "26(b)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.                                                                                                                    Low -None.\nModerate -None.\nHigh -None\nVery High -  Natural gas liquefaction plant, Natural gas compression facility",
    "ScaleDefinition": "Specific definitions for the Scale category is not yet developed for this Designated Activity. Officers should consider the potential area of impact of the activities to the extent that:\nN/A is \u2264 0.0465 ha; \nVery Low is \u2264 1 ha; \nLow is \u2264 2 ha; \nModerate is \u2264 5 ha; \nHigh is \u2264 10 ha; \nVery High > 10 ha.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "27": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - Metering stations, Odorizers\nLow -None.\nModerate -Valve stations\nHigh - Natural gas pipeline, Condensate pipeline, Produced water pipeline\nVery High - Crude oil pipeline, Produced fluids",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A is \u2264 0.0465 ha; \nVery Low -1 km long, 300 psi or 2 inch diameter;\nLow - 1- 4.9 km long, 300 - 699 psi or 2 - 5.9 inch diameter;\nModerate - 5 - 19.9 km long, 700 - 999 psi or 6 - 11.9 inch diameter;\nHigh -20 - 50 km long, 1,000 - 1,200 psi or 12 -19.9 inch diameter;\nVery High > 50 km, 1,200 psi or 20 inch diameter.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "28": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.\nLow -None.\nModerate - Modification of equipment or expansion of refinery.\nHigh - Decommissioning of equipment in oil refinery, Establishment of a Sulphur diesel unit, Establishment of a sulphuric acid unit, Catalytic cracking unit, Alkylation unit\nVery High - Establishment of refinery.",
    "ScaleDefinition": "Specific definitions for the Scale category is not yet developed for this Designated Activity. Officers should consider the potential area of impact of the activities to the extent that:\nN/A is \u2264 0.0465 ha; \nVery Low is \u2264 1 ha; \nLow is \u2264 2 ha; \nModerate is \u2264 5 ha; \nHigh is \u2264 10 ha; \nVery High > 10 ha.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "29": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.\nLow -None.\nModerate - LNG, diesel, gasoline, lubricant oil, base oil, decommissioning\nHigh -Produced water, LPG\nVery High - Crude oil, Methanol, Fuel oil, Jet fuel",
    "ScaleDefinition": "Specific definitions for the Scale category is not yet developed for this Designated Activity. Officers should consider the potential area of impact of the activities to the extent that:\nN/A is \u2264 499 barrels\nVery Low - 500 - 2,499 barrels;\nLow - 3,000 - 9,999 barrels; \nModerate - 10, 49,999 barrels\nHigh - 50,000 - 199,999 barrels\nVery High  \u2265 200,000 barrels",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "30": {
    "NatureDefinition": "Specific definitions for the Nature risk category is not yet developed for this Designated Activity. Officers should consider of the number of activities in the scope of work, and environmental hazards that may arise from these activities.\n",
    "ScaleDefinition": "Specific definitions for the Scale category is not yet developed for this Designated Activity. Officers should consider the potential area of impact of the activities to the extent that:\nN/A is \u2264 0.0465 ha; \nVery Low is \u2264 1 ha; \nLow is \u2264 2 ha; \nModerate is \u2264 5 ha; \nHigh is \u2264 10 ha; \nVery High > 10 ha.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors e.g. industrial, commercial, agricultural, mixed use etc.;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "31(a)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.\nLow -Butterfly zoo, Heritage park, Nature park/Nature trails/Visitor center \nModerate - Petting zoo, Amusement park\nHigh -Water park, Zoo\nVery High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A is \u2264 499 persons;\nVery Low - 500 - 1000 persons;\nLow - 1,000 - 2,499 persons;\nModerate - 2,500 - 4,999 persons\nHigh is < 5,000 persons;\nVery High - None.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "31(b)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.\nLow -Mini-golf\nModerate - None.\nHigh -Golf course\nVery High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A is \u2264 499 persons;\nVery Low - 500 - 1000 persons;\nLow - 1,000 - 2,499 persons;\nModerate - 2,500 - 4,999 persons\nHigh is < 5,000 persons;\nVery High - None.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "32": {
    "NatureDefinition": "Specific definitions for the Nature risk category is not yet developed for this Designated Activity. Officers should consider of the number of activities in the scope of work, and environmental hazards that may arise from these activities.\n",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A is \u2264 0.0465 ha; \nVery Low is \u2264 1 ha; \nLow is \u2264 2 ha; \nModerate is \u2264 5 ha; \nHigh is \u2264 10 ha; \nVery High > 10 ha.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors e.g. industrial, commercial etc.;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "33(a)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - Internal road, Collector road\nLow -Main road/By-pass\nModerate -Overpass/Underpass\nHigh - Interchange\nVery High - Highway",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A is < 1 km\nVery Low - 1 km - 2.9 km\nLow - 3 - 9.9 km long;                                                                                                                                                            Moderate - 10 - 19.9 km long;\nHigh -20 - 29.9 km long;\nVery High > 30 km long.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "33(b)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - Internal road, Collector road\nLow -Main road/By-pass\nModerate -None. \nHigh - None.\nVery High - Highway",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A is < 1 km\nVery Low - 1 km - 2.9 km\nLow - 3 - 9.9 km long;                                                                                                                                                            Moderate - 10 - 19.9 km long;\nHigh -20 - 29.9 km long;\nVery High > 30 km long.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "34": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None                                                                                                                     Low -None\nModerate -Fishing facility/depot\nBoat/vessel manufacture (artisanal/small crafts)\nHigh - Mooring of vessels, Marina (pleasure crafts/small boats)\nCargo port/terminal\nVery High - Port facility (large vessels, cargo and passengers), Dry docking of vessels/seacrafts, Offshore transshipment site, Ship repair , Boat/vessel manufacture, (large commercial vessels)",
    "ScaleDefinition": "Specific definitions for the Scale category is not yet developed for this Designated Activity. Officers should consider the potential area of impact of the activities to the extent that:\nN/A is \u2264 0.0465 ha; \nVery Low is \u2264 1 ha; \nLow is \u2264 2 ha; \nModerate is \u2264 5 ha; \nHigh is \u2264 10 ha; \nVery High > 10 ha.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "35": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.\nLow - Temporary waste storage\nModerate - Landfills - all\nHigh - None                                                                                                                                   Very High - None.",
    "ScaleDefinition": "Specific definitions for the Scale category is not yet developed for this Designated Activity. Officers should consider the potential area of impact of the activities to the extent that:\nN/A is \u2264 0.0465 ha; \nVery Low is \u2264 1 ha; \nLow is \u2264 2 ha; \nModerate is \u2264 5 ha; \nHigh is \u2264 10 ha; \nVery High > 10 ha.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "36": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.\nLow - None.\nModerate - Other - electronic wastes etc.\nHigh - Oxidizing, Organic peroxides, Acute poisonous                                          Very High - Explosives, Flammable liquids (organic based)\nFlammable solids, Substances liable to spontaneous combustion, Substances which emit flammable gas in contact with water, Infectious substances, Corrosives, Substances which emit toxic gas in contact with air or water, Delayed/chronic toxic, Ecotoxic",
    "ScaleDefinition": "Specific definitions for the Scale category is not yet developed for this Designated Activity. Officers should consider the potential area of impact of the activities to the extent that:\nN/A is \u2264 0.0465 ha; \nVery Low is \u2264 1 ha; \nLow is \u2264 2 ha; \nModerate is \u2264 5 ha; \nHigh is \u2264 10 ha; \nVery High > 10 ha.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "37": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.\nLow - Recovery/recycling\nModerate - Incineration - all\nHigh - None                                                                                                                                   Very High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A - None\nVery Low is \u2264 0.049 metric tons/day\nLow - 0.05 - 0.99 metric ton/day\nModerate - 1 - 9.9 metric tons/day\nHigh - 10 - 49.9 metric tons/day                                                                          Very High > 50 metric tons/day.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "38(a)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - Catchment\nLow -Abstraction\nModerate - Treatment\nHigh - None.\nVery High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A - None                                                                                                                                Very Low - None                                                                                                                                 \nLow - At all levels.\nModerate - None.\nHigh - None.\nVery High - None.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "38(b)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.\nLow -Water wells\nModerate - None.\nHigh -None.\nVery High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A - None                                                                                                                                     Very Low - None                                                                                                                                         \nLow - 1 - 3 wells\nModerate - 4 - 10 wells.\nHigh - < 10 wells.\nVery High - None.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "38(c)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - Decommissioning\nLow -Water wells\nModerate - Desalination \u2013 reverse osmosis, thermal, chemical\nHigh -None.\nVery High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A - None                                                                                                                                     Very Low - None                                                                                                                                         \nLow - 1 - \u2264 4,999 m3/day\nModerate - 5,000 - 19,999 m3/day\nHigh - 20,000 - 49,999 m3/day\nVery High > 50,000 m3/day",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "39": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.\nLow - All ponds\nModerate - None.\nHigh -None.\nVery High - None.",
    "ScaleDefinition": "Specific definitions for the Scale category is not yet developed for this Designated Activity. Officers should consider the potential area of impact of the activities to the extent that:\nN/A is \u2264 0.0465 ha; \nVery Low is \u2264 1 ha; \nLow is \u2264 2 ha; \nModerate is \u2264 5 ha; \nHigh is \u2264 10 ha; \nVery High > 10 ha.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "40(a)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.\nLow - Potable and process water lines\nModerate - Sewage lines\nHigh -None.\nVery High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A - None                                                                                                                                Very Low - None                                                                                                                                 \nLow - At all levels.\nModerate - None.\nHigh - None.\nVery High - None.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "40(b)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None.\nLow - Water mains\nModerate - Sewage mains\nHigh -None\nVery High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A - None                                                                                                                                Very Low - None                                                                                                                                 \nLow - None\nModerate - At all levels\nHigh - None.\nVery High - None.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "41(a)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - Drainage and irrigation systems\nLow - None\nModerate - None\nHigh -None\nVery High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A - None                                                                                                                                Very Low - None                                                                                                                                 \nLow - At all levels\nModerate - None                                                                                                                                     High - None\nVery High - None.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "41(b)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None\nLow - Flood control system, water supply impoundment\nModerate - None\nHigh -None\nVery High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A - None                                                                                                                                Very Low - None                                                                                                                                 \nLow - At all levels\nModerate - None                                                                                                                                     High - None\nVery High - None.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "41(c)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None\nLow - Establishment of bridges/crossings, Damming/Temporary diversion, Retaining/stabilization structures\nModerate - Realignment\nHigh -None\nVery High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A - None                                                                                                                                Very Low - Bridges/crossings at all levels.                                                                                                                                \nLow - At all levels\nModerate - Dams/diversions at all levels.                                                                                                                                     High - Realignment at all levels.\nVery High - None.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "42": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None\nLow - None.\nModerate - sewage/domestic wastewater\nHigh - Industrial wastewater\nVery High - Produced water",
    "ScaleDefinition": "Specific definitions for the Scale category is not yet developed for this Designated Activity. Officers should consider the potential area of impact of the activities to the extent that:\nN/A - None\nVery Low - 1 - 14.9 m3/day\nLow - 15 - 49.9 m3/day\nModerate - 50 - 199.9 m3/day\nHigh - 200 - 499.9 m3/day\nVery High 500 m3/day",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "43(a)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None\nLow - Vehicle washing\nModerate - Fuel station - decommissioning, Vehicle maintenance, Autobody repair, Vehicle painting/straightening, Mechanical repair\nHigh - Fuel station \u2013 establishment \nVery High - None.",
    "ScaleDefinition": "Specific definitions for the Scale category is not yet developed for this Designated Activity. Officers should consider the potential area of impact of the activities to the extent that:\nN/A is \u2264 0.0465 ha; \nVery Low is \u2264 1 ha; \nLow is \u2264 2 ha; \nModerate is \u2264 5 ha; \nHigh is \u2264 10 ha; \nVery High > 10 ha.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "43(b)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None\nLow - Wet - washing/laundering\nModerate - Dry cleaning\nHigh -None\nVery High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A - None                                                                                                                                Very Low - None                                                                                                                     \nLow - Wet cleaning - at all levels.\nModerate - Dry cleaning - at all levels.                                                                                                                                     High - None.\nVery High - None.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "43(c)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None\nLow  - None\nModerate - Commercial kitchen\nHigh -None\nVery High - None.",
    "ScaleDefinition": "Officers should be guided by the following definitions for Scale risk assessment:\nN/A - None                                                                                                                                Very Low - None                                                                                                                     \nLow - None\nModerate - At all levels.                                                                                                                                     High - None.\nVery High - None.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "43(d)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None\nLow - Biosafety-Level 1, Food and drug\nModerate - Chemical/industrial lab , Biosafety-Level 2, Toxicology and environmental testing\nHigh - Clinical/medical/hospital, Biosafety-Level 3\nVery High - Biosafety-Level 4",
    "ScaleDefinition": "Specific definitions for the Scale category is not yet developed for this Designated Activity. Officers should consider the potential area of impact of the activities to the extent that:\nN/A is \u2264 0.0465 ha; \nVery Low is \u2264 1 ha; \nLow is \u2264 2 ha; \nModerate is \u2264 5 ha; \nHigh is \u2264 10 ha; \nVery High > 10 ha.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "44(a)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None\nLow - Animal burial\nModerate - Human burial\nHigh - None\nVery High - None",
    "ScaleDefinition": "Specific definitions for the Scale category is not yet developed for this Designated Activity. Officers should consider the potential area of impact of the activities to the extent that:\nN/A is \u2264 0.0465 ha; \nVery Low is \u2264 1 ha; \nLow is \u2264 2 ha; \nModerate is \u2264 5 ha; \nHigh is \u2264 10 ha; \nVery High > 10 ha.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  },
  "44(b)": {
    "NatureDefinition": "Officers should be guided by the following definitions for Nature risk assessment:\nN/A - None.\nVery Low - None\nLow - Animal cremation                                                                                                 Moderate - Human cremation\nHigh - None\nVery High - None",
    "ScaleDefinition": "Specific definitions for the Scale category is not yet developed for this Designated Activity. Officers should consider the potential area of impact of the activities to the extent that:\nN/A is \u2264 0.0465 ha; \nVery Low is \u2264 1 ha or 1 body; \nLow is \u2264 2 ha or 2 bodies; \nModerate is \u2264 5 ha or 3 bodies; \nHigh is \u2264 10 ha or 5 bodies; \nVery High - N/A.",
    "LocationDefinition": "Officers should consider the Location of proposed activity in relation to nearby sensitive receptors defined as:\n N/A is no human or ecological receptor present;                                                                            Very Low is existing facility;\nLow is area presently being used for similar purpose with no potentially affected receptors i.e. agricultural, commercial, industrial, mixed use;\nModerate is area with potentially affected receptors e.g. residential, cultural, religious organizations, schools, forest etc.;                                                                                                         High is area with sensitive receptors e.g. marine, coastal, forest reserve, beach, mangrove etc.;                                                                                                                                   Very High is area with very sensitive receptors e.g. Environmentally Sensitive Area or known habitat of Environmentally Sensitive Species."
  }
}

const da_data = [
  {
    "DA": "1(a)",
    "Nature": 1.5,
    "Scale": 1.5,
    "Location": 3
  },
  {
    "DA": "1(b)",
    "Nature": 2,
    "Scale": 1,
    "Location": 3
  },
  {
    "DA": "2",
    "Nature": 1.5,
    "Scale": 1.5,
    "Location": 3
  },
  {
    "DA": "3",
    "Nature": 2,
    "Scale": 1,
    "Location": 3
  },
  {
    "DA": "4",
    "Nature": 1,
    "Scale": 2,
    "Location": 3
  },
  {
    "DA": "5(a)",
    "Nature": 1.5,
    "Scale": 1.5,
    "Location": 3
  },
  {
    "DA": "5(b)",
    "Nature": 1.5,
    "Scale": 1.5,
    "Location": 3
  },
  {
    "DA": "6",
    "Nature": 2,
    "Scale": 2,
    "Location": 2
  },
  {
    "DA": "7",
    "Nature": 2,
    "Scale": 3,
    "Location": 1
  },
  {
    "DA": "8(a)",
    "Nature": 1,
    "Scale": 2.5,
    "Location": 2.5
  },
  {
    "DA": "8(b)",
    "Nature": 2.5,
    "Scale": 1,
    "Location": 2.5
  },
  {
    "DA": "8(c)",
    "Nature": 1.5,
    "Scale": 3,
    "Location": 1.5
  },
  {
    "DA": "9",
    "Nature": 1.5,
    "Scale": 3,
    "Location": 1.5
  },
  {
    "DA": "10(a)",
    "Nature": 1,
    "Scale": 3,
    "Location": 2
  },
  {
    "DA": "10(b)",
    "Nature": 1,
    "Scale": 2.5,
    "Location": 2.5
  },
  {
    "DA": "11",
    "Nature": 1,
    "Scale": 2.5,
    "Location": 2.5
  },
  {
    "DA": "12",
    "Nature": 2.5,
    "Scale": 1,
    "Location": 2.5
  },
  {
    "DA": "13(a)",
    "Nature": 2.5,
    "Scale": 1,
    "Location": 2.5
  },
  {
    "DA": "13(b)",
    "Nature": 2.5,
    "Scale": 1,
    "Location": 2.5
  },
  {
    "DA": "13(c)",
    "Nature": 2.5,
    "Scale": 1,
    "Location": 2.5
  },
  {
    "DA": "14(a)",
    "Nature": 2,
    "Scale": 2,
    "Location": 2
  },
  {
    "DA": "14(b)",
    "Nature": 2,
    "Scale": 2,
    "Location": 2
  },
  {
    "DA": "15",
    "Nature": 1.5,
    "Scale": 1.5,
    "Location": 3
  },
  {
    "DA": "16",
    "Nature": 1.5,
    "Scale": 1.5,
    "Location": 3
  },
  {
    "DA": "17",
    "Nature": 2,
    "Scale": 2,
    "Location": 2
  },
  {
    "DA": "18(a)",
    "Nature": 1,
    "Scale": 2,
    "Location": 3
  },
  {
    "DA": "18(b)",
    "Nature": 1,
    "Scale": 2,
    "Location": 3
  },
  {
    "DA": "19",
    "Nature": 2.5,
    "Scale": 1,
    "Location": 2.5
  },
  {
    "DA": "20(a)",
    "Nature": 3,
    "Scale": 2,
    "Location": 1
  },
  {
    "DA": "20(b)",
    "Nature": 3,
    "Scale": 2,
    "Location": 1
  },
  {
    "DA": "20(c)",
    "Nature": 1.5,
    "Scale": 1.5,
    "Location": 3
  },
  {
    "DA": "20(d)",
    "Nature":1.5,
    "Scale": 1.5,
    "Location": 3
  },
  {
    "DA": "21",
    "Nature": 3,
    "Scale": 2,
    "Location": 1
  },
  {
    "DA": "22",
    "Nature": 2.5,
    "Scale": 2.5,
    "Location": 1
  },
  {
    "DA": "23",
    "Nature": 2.5,
    "Scale": 2.5,
    "Location": 1
  },
  {
    "DA": "24",
    "Nature": 2.5,
    "Scale": 2.5,
    "Location": 1
  },
  {
    "DA": "25",
    "Nature": 2.5,
    "Scale": 2.5,
    "Location": 1
  },
  {
    "DA": "26(a)",
    "Nature": 2.5,
    "Scale": 2.5,
    "Location": 1
  },
  {
    "DA": "26(b)",
    "Nature": 2.5,
    "Scale": 2.5,
    "Location": 1
  },
  {
    "DA": "27",
    "Nature": 1,
    "Scale": 2.5,
    "Location": 2.5
  },
  {
    "DA": "28",
    "Nature": 2.5,
    "Scale": 2.5,
    "Location": 1
  },
  {
    "DA": "29",
    "Nature": 2.5,
    "Scale": 2.5,
    "Location": 1
  },
  {
    "DA": "30",
    "Nature": 1.5,
    "Scale": 1.5,
    "Location": 3
  },
  {
    "DA": "31(a)",
    "Nature": 1,
    "Scale": 2.5,
    "Location": 2.5
  },
  {
    "DA": "31(b)",
    "Nature": 1,
    "Scale": 2.5,
    "Location": 2.5
  },
  {
    "DA": "32",
    "Nature": 2,
    "Scale": 2,
    "Location": 2
  },
  {
    "DA": "33(a)",
    "Nature": 2,
    "Scale": 2,
    "Location": 2
  },
  {
    "DA": "33(b)",
    "Nature":2,
    "Scale": 2,
    "Location": 2
  },
  {
    "DA": "34",
    "Nature": 2.5,
    "Scale": 2.5,
    "Location": 1
  },
  {
    "DA": "35",
    "Nature": 3,
    "Scale": 2,
    "Location": 1
  },
  {
    "DA": "36",
    "Nature": 3,
    "Scale": 2,
    "Location": 1
  },
  {
    "DA": "37",
    "Nature": 2.5,
    "Scale": 2.5,
    "Location": 1
  },
  {
    "DA": "38(a)",
    "Nature": 1.5,
    "Scale": 3,
    "Location": 1.5
  },
  {
    "DA": "38(b)",
    "Nature": 1.5,
    "Scale": 3,
    "Location": 1.5
  },
  {
    "DA": "38(c)",
    "Nature": 1.5,
    "Scale": 3,
    "Location": 1.5
  },
  {
    "DA": "39",
    "Nature": 2,
    "Scale": 2,
    "Location": 2
  },
  {
    "DA": "40(a)",
    "Nature": 2,
    "Scale": 2,
    "Location": 2
  },
  {
    "DA": "40(b)",
    "Nature": 2,
    "Scale": 2,
    "Location": 2
  },
  {
    "DA": "41(a)",
    "Nature": 2,
    "Scale": 2,
    "Location": 2
  },
  {
    "DA": "41(b)",
    "Nature":1.5,
    "Scale": 3,
    "Location": 1.5
  },
  {
    "DA": "41(c)",
    "Nature": 1.5,
    "Scale": 3,
    "Location": 1.5
  },
  {
    "DA": "42",
    "Nature": 1.5,
    "Scale": 3,
    "Location": 1.5
  },
  {
    "DA": "43(a)",
    "Nature": 1,
    "Scale": 2.5,
    "Location": 2.5
  },
  {
    "DA": "43(b)",
    "Nature": 2,
    "Scale": 2,
    "Location": 2
  },
  {
    "DA": "43(c)",
    "Nature": 2,
    "Scale": 2,
    "Location": 2
  },
  {
    "DA": "43(d)",
    "Nature": 3,
    "Scale": 1.5,
    "Location": 1.5
  },
  {
    "DA": "44(a)",
    "Nature": 2,
    "Scale": 2,
    "Location": 2
  },
  {
    "DA": "44(b)",
    "Nature": 2,
    "Scale": 2,
    "Location": 2
  },	
];

const daSelectionModal = document.getElementById("daSelectionModal");
const daSelectionBtn = document.getElementById("daSelectionBtn");
const confirmDAForm = document.getElementById("confirmDAForm");
const clearDAForm = document.getElementById("clearDAForm");
const daTableBody = document.querySelector("#daTable tbody");

let lastDrawnLayer = null;
let storedDAInputs = {
  projectTitle: "",
  cecNumber: "",
  coordinates: null,
  selectedActivities: {}
};

let modelOutputGenerated = false;
let riskAssessmentStarted = false;


// Show Modal on Button Click
daSelectionBtn.addEventListener("click", () => {
  populateDATable();
  daSelectionModal.style.display = "block";
});

document.getElementById("modelOutputBtn").addEventListener("click", () => {
  if (modelOutputGenerated) {
    showModelOutput();
  } else {
    alert("Model Output is not available. Please complete the risk assessment first.");
  }
});

document.getElementById("riskAssessmentBtn").addEventListener("click", () => {
  if (riskAssessmentStarted) {
    showRiskAssessment();
  } else {
    alert("Risk Assessment is not available. Please complete the DA Selection step first.");
  }
});

// Clear form
clearDAForm.addEventListener("click", () => {
  document.getElementById("projectTitle").value = "";
  document.getElementById("cecNumber").value = "";
  document.getElementById("latlonInput").value = "";
  Array.from(document.querySelectorAll("#daTable select")).forEach(sel => sel.value = "No");
  storedDAInputs = {
    projectTitle: "",
    cecNumber: "",
    coordinates: null,
    selectedActivities: {}
  };
  
  riskAssessmentStarted = false; // clears the Risk Assessment access until new entry made
  modelOutputGenerated = false; // clears Model Output access until new entry is made
});

// Use Last Drawn Feature
document.getElementById("useDrawnFeatureBtn").addEventListener("click", () => {
  const layers = drawnItems.getLayers();
  if (layers.length === 0) {
    //alert("Please draw a point or polygon first.");
    return;
  }

  const shape = layers[layers.length - 1];
  let latlng;

  if (shape.getLatLng) {
    latlng = shape.getLatLng();
    document.getElementById("latlonInput").value = `${latlng.lng.toFixed(6)}, ${latlng.lat.toFixed(6)}`;
  } else if (shape instanceof L.Polygon || shape instanceof L.Rectangle) {
    const bounds = shape.getBounds();
    const center = bounds.getCenter();
    document.getElementById("latlonInput").value = `${center.lng.toFixed(6)}, ${center.lat.toFixed(6)}`;
  }

});

document.getElementById("clearSpatialBtn").addEventListener("click", () => {
  // Clear CEC table
  document.getElementById("cecListBody").innerHTML = "";

  // Clear Receptors table
  const receptorsTable = document.querySelector("#receptorsTable tbody");
  receptorsTable.innerHTML = "";

  // Reset other info labels
  [
    "municipalityLabel",
    "watershedLabel",
    "ecoLabel",
    "geoLabel",
    "hydroLabel",
    "socialLabel",
    "tcpdLabel"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = "None";
  });
});


document.addEventListener("DOMContentLoaded", () => {
  const btn = document.querySelector("#rightPanel #useDrawnFeatureBtn");
  if (!btn) {
    console.warn("Sidebar spatial analysis button not found.");
    return;
  }

  btn.addEventListener("click", () => {
    const layers = drawnItems.getLayers();
    if (layers.length === 0) {
      //alert("Please draw a shape first.");
      return;
    }

    const shape = layers[layers.length - 1]; // get the last drawn shape
    performSpatialAnalysis(shape, "sidePanel");
  });
});

document.addEventListener("DOMContentLoaded", () => {
  const downloadBtn = document.getElementById("downloadModelPDF");

  if (downloadBtn) {
    downloadBtn.addEventListener("click", async () => {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a5" // A5 page
      });

      const content = document.querySelector("#modelOutputModal .nsl-modal-content");
      if (!content) return;

      // Temporarily hide close and download buttons
      const closeBtn = document.getElementById("closeModelOutputModal");
      const downloadBtn = document.getElementById("downloadModelPDF");

      if (closeBtn) closeBtn.style.display = "none";
      if (downloadBtn) downloadBtn.style.display = "none";
	  
	  // Render modal content to canvas at high resolution
      const canvas = await html2canvas(content, {
        scale: 2,
        useCORS: true
      });

      // Restore buttons
      if (closeBtn) closeBtn.style.display = "";
      if (downloadBtn) downloadBtn.style.display = "";

      const imgData = canvas.toDataURL("image/png");

      const pageWidth = 148;
      const pageHeight = 210;
      const margin = 20;

      const imgProps = pdf.getImageProperties(imgData);
      const imgWidth = pageWidth - 2 * margin;
      const imgHeight = (imgProps.height * imgWidth) / imgProps.width;

      // If image height fits, just add it centered
      pdf.addImage(imgData, "PNG", margin, margin, imgWidth, imgHeight);

      pdf.save("NSL_Model_Output.pdf");
    });
  }
});


function shapeToFeature(layer) {
  if (layer instanceof L.Marker) {
    const latlng = layer.getLatLng();
    return turf.point([latlng.lng, latlng.lat]);
  } else if (layer instanceof L.Polygon || layer instanceof L.Rectangle) {
    const coords = layer.getLatLngs()[0].map(p => [p.lng, p.lat]);
    coords.push(coords[0]); // Close the polygon
    return turf.polygon([coords]);
  }
  return null;
}


function performSpatialAnalysis(shape, mode = "sidePanel") {
  const turfShape = shapeToFeature(shape);
  if (!turfShape) return;

  // === CEC NEARBY ===
  const nearbyCECs = currentData.filter(row => {
    const coords = [parseFloat(row.Longitude), parseFloat(row.Latitude)];
    if (isNaN(coords[0]) || isNaN(coords[1])) return false;
    const pt = turf.point(coords);
    return turf.booleanPointInPolygon(pt, turf.buffer(turfShape, 1, { units: 'kilometers' }));
  });

const receptors = [];

for (const layerName of receptorLayers) {
  const layer = geojsonLayers[layerName];
  if (!layer) continue;

  const labelField = labelFields[layerName];

  layer.eachLayer(l => {
    const feature = l.feature;
    if (!feature) return;

    // Intersect check
    const intersects = !turf.booleanDisjoint(turfShape, feature);

    // Calculate distance from shape to feature boundary
    let distance;
    try {
      const nearest = turf.nearestPointOnLine(
        turf.polygonToLine(feature),
        turf.center(turfShape),
        { units: "meters" }
      );
      distance = nearest.properties.dist;
    } catch (e) {
      console.warn(`Failed distance calc for ${labelField}`, e);
      return;
    }

if (intersects || distance < 1000) {
  const label = feature.properties[labelField] || "Unnamed";
  const distDisplay = intersects ? "Within Boundaries" : distance.toFixed(1);
  receptors.push({ label, dist: distDisplay });
}

  });
}

const intersections = {
  Municipality: [],
  Watershed: [],
  "Ecological Susceptibility": [],
  "Geological Susceptibility": [],
  Hydrogeology: [],
  "Social Susceptibility": [],
  "TCPD Policy": []
};

for (const name of layersRequiredForAnalysis) {
  const layerGroup = geojsonLayers[name];
  if (!layerGroup) continue;

  const labelField = labelFields[name];

  layerGroup.eachLayer(featureLayer => {
    const feature = featureLayer.feature;
    if (!feature) return;

    if (!turf.booleanDisjoint(turfShape, feature)) {
      const label = feature.properties[labelField] || "Unnamed";

      for (const key in intersections) {
        if (name.includes(key) && !intersections[key].includes(label)) {
          intersections[key].push(label);
        }
      }
    }
  });
}

// Populate output to the labels
const updateLabel = (id, values) => {
  const el = document.getElementById(id);
  el.innerText = values.length ? values.join(", ") : "None";
};

updateLabel("municipalityLabel", intersections.Municipality);
updateLabel("watershedLabel", intersections.Watershed);
updateLabel("ecoLabel", intersections["Ecological Susceptibility"]);
updateLabel("geoLabel", intersections["Geological Susceptibility"]);
updateLabel("hydroLabel", intersections.Hydrogeology);
updateLabel("socialLabel", intersections["Social Susceptibility"]);
updateLabel("tcpdLabel", intersections["TCPD Policy"]);


  // === Output to Panel ===
  if (mode === "sidePanel") {
    const cecBody = document.getElementById("cecListBody");
    cecBody.innerHTML = "";
    if (nearbyCECs.length) {
      nearbyCECs.forEach(row => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${row["CEC Reference"]}</td>
          <td>${row.Year}</td>
          <td>${row["Application Determination"]}</td>`;
        cecBody.appendChild(tr);
      });
    } else {
      cecBody.innerHTML = `<tr><td colspan="3">None</td></tr>`;
    }

const receptorTable = document.querySelector("#receptorsTable tbody");
receptorTable.innerHTML = "";
if (receptors.length) {
  receptors.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.label}</td><td>${r.dist}</td>`;
    receptorTable.appendChild(tr);
  });
} else {
  receptorTable.innerHTML = `<tr><td colspan="2">None</td></tr>`;
}

    }

    const updateText = (id, values) => {
      document.getElementById(id).innerText = values.length ? values.join(", ") : "None";
    };

    updateText("municipalityLabel", intersections.Municipality);
    updateText("watershedLabel", intersections.Watershed);
    updateText("ecoLabel", intersections["Ecological Susceptibility"]);
    updateText("geoLabel", intersections["Geological Susceptibility"]);
    updateText("hydroLabel", intersections.Hydrogeology);
    updateText("socialLabel", intersections["Social Susceptibility"]);
    updateText("tcpdLabel", intersections["TCPD Policy"]);
  }


// Confirm and Store Input
confirmDAForm.addEventListener("click", () => {
  storedDAInputs.projectTitle = document.getElementById("projectTitle").value.trim();
  storedDAInputs.latlonInput = document.getElementById("latlonInput").value.trim();
  storedDAInputs.cecNumber = document.getElementById("cecNumber").value.trim();



  const selected = {};
  document.querySelectorAll("#daTable tbody tr").forEach(row => {
    const code = row.dataset.code;
    const selection = row.querySelector("select").value;
    if (selection === "Yes") {
      selected[code] = true;
    }
  });
  storedDAInputs.selectedActivities = selected;

  daSelectionModal.style.display = "none";
  riskAssessmentStarted = true;
  showRiskAssessment(); // proceed to next window (to be defined)
});
document.getElementById("closeDASelectionModal").addEventListener("click", () => {
  daSelectionModal.style.display = "none";
});


// Populate table with activities
function populateDATable() {
  daTableBody.innerHTML = "";
  designatedActivities.forEach(act => {
    const row = document.createElement("tr");
    row.dataset.code = act.code;
    row.innerHTML = `
      <td><strong>${act.code}</strong></td>
      <td>${act.description}</td>
      <td>
        <select>
          <option>No</option>
          <option>Yes</option>
        </select>
      </td>
    `;
    daTableBody.appendChild(row);
  });
}
daSelectionBtn.addEventListener("click", () => {
  //console.log("DA Selection clicked");
  populateDATable();
  daSelectionModal.style.display = "block";
});

function populateDATable() {
  daTableBody.innerHTML = "";
  designatedActivities.forEach(act => {
    const row = document.createElement("tr");
    row.dataset.code = act.code;

    const selected = storedDAInputs.selectedActivities[act.code] ? "Yes" : "No";

    row.innerHTML = `
      <td><strong>${act.code}</strong></td>
      <td>${act.description}</td>
      <td>
        <select>
          <option ${selected === "No" ? "selected" : ""}>No</option>
          <option ${selected === "Yes" ? "selected" : ""}>Yes</option>
        </select>
      </td>
    `;
    daTableBody.appendChild(row);
  });

  // Restore text inputs
  document.getElementById("projectTitle").value = storedDAInputs.projectTitle || "";
  document.getElementById("cecNumber").value = storedDAInputs.cecNumber || "";
  if (!storedDAInputs.coordinates || storedDAInputs.coordinates.type === "Point") {
    document.getElementById("latlonInput").value = storedDAInputs.coordinates?.coordinates?.join(", ") || "";
  }
}
//----------------------------------------------------------------------------------------
// ====================================================
// RISK ASSESSMENT: Build Table from Selected Activities
// ====================================================

const riskAssessmentModal = document.getElementById("riskAssessmentModal");
const closeRiskModal = document.getElementById("closeRiskModal");
const confirmRiskBtn = document.getElementById("confirmRiskBtn");
const riskTableBody = document.querySelector("#riskTable tbody");

// Show Risk Assessment Modal (after confirming DA)
function showRiskAssessment() {
  riskAssessmentModal.style.display = "block";

  document.getElementById("riskProjectTitle").textContent = storedDAInputs.projectTitle;
  document.getElementById("riskCecNumber").textContent = storedDAInputs.cecNumber;

  populateRiskTable();
}
function extractSortKey(code) {
  const match = code.match(/^(\d+)(?:\((\w)\))?/);
  if (!match) return [9999, 'z'];
  const number = parseInt(match[1], 10);
  const letter = match[2] ? match[2].toLowerCase().charCodeAt(0) : 0;
  return number * 100 + letter; // '1(a)' = 1*100 + 97 = 197, '2' = 200
}

function populateRiskTable() {
  riskTableBody.innerHTML = "";

  Object.keys(storedDAInputs.selectedActivities)
	.sort((a, b) => extractSortKey(a) - extractSortKey(b))
	.forEach(code => {
    const riskDef = riskDefinitions[code] || {};
    const row = document.createElement("tr");
    row.dataset.code = code;

    row.innerHTML = `
      <td><strong>${code}</strong></td>
      <td>
        <select>
          <option>N/A</option>
          <option>Very Low</option>
          <option>Low</option>
          <option>Moderate</option>
          <option>High</option>
          <option>Very High</option>
        </select>
      </td>
      <td>
        <select>
          <option>N/A</option>
          <option>Very Low</option>
          <option>Low</option>
          <option>Moderate</option>
          <option>High</option>
          <option>Very High</option>
        </select>
      </td>
      <td>
        <select>
          <option>N/A</option>
          <option>Very Low</option>
          <option>Low</option>
          <option>Moderate</option>
          <option>High</option>
          <option>Very High</option>
        </select>
      </td>
		<td><div class="guidance-box">${(riskDef.NatureDefinition || "").replace(/\n/g, "<br>")}</div></td>
		<td><div class="guidance-box">${(riskDef.ScaleDefinition || "").replace(/\n/g, "<br>")}</div></td>
		<td><div class="guidance-box">${(riskDef.LocationDefinition || "").replace(/\n/g, "<br>")}</div></td>

    `;

    riskTableBody.appendChild(row);
  });
}

// Close button
closeRiskModal.addEventListener("click", () => {
  riskAssessmentModal.style.display = "none";
});

// On confirm → store selections & continue
confirmRiskBtn.addEventListener("click", () => {
  storedDAInputs.riskRatings = {};

  document.querySelectorAll("#riskTable tbody tr").forEach(row => {
    const code = row.dataset.code;
    const selects = row.querySelectorAll("select");
    storedDAInputs.riskRatings[code] = {
      Nature: selects[0].value,
      Scale: selects[1].value,
      Location: selects[2].value
    };
  });

  riskAssessmentModal.style.display = "none";
  showModelOutput(); // define this next
});
//----------------------------------------------------------------
// ========================================
// MODEL OUTPUT LOGIC & CALCULATION
// ========================================

const modelOutputModal = document.getElementById("modelOutputModal");
const closeModelOutputModal = document.getElementById("closeModelOutputModal");

const outputProjectTitle = document.getElementById("outputProjectTitle");
const outputlatlonInput = document.getElementById("outputlatlonInput")
const outputCecNumber = document.getElementById("outputCecNumber");
const activityListOutput = document.getElementById("activityListOutput");
const nslScoreDisplay = document.getElementById("nslScoreDisplay");
const nslDecisionText = document.getElementById("nslDecisionText");

// Close model output modal
closeModelOutputModal.addEventListener("click", () => {
  modelOutputModal.style.display = "none";
});

function showModelOutput() {
  modelOutputModal.style.display = "block";

  // 1. Display stored project info
  outputProjectTitle.textContent = storedDAInputs.projectTitle;
  outputlatlonInput.textConten = storedDAInputs.latlonInput;
  outputCecNumber.textContent = storedDAInputs.cecNumber;

  // 2. List selected activities
const activityCodes = Object.keys(storedDAInputs.selectedActivities)
  .sort((a, b) => extractSortKey(a) - extractSortKey(b));

activityListOutput.textContent = activityCodes.join(", ");


  // 3. Compute NSL Score
  const score = calculateNSLScore();
  const nslPercent = (score * 100).toFixed(2);
  const threshold = 0.75;
  const decision = score >= threshold ? "EIA SOP Is Required" : "EIA SOP Is Not Required";
  const nslTextContainer = document.getElementById("nslIndexDetail");

  if (nslPercent <= threshold) {
    nslTextContainer.textContent = "Information provided by applicant is believed to be insufficient and/or indicates high likelihood of significant impact to human health and environment. A more thorough screening is required to determine the extent of risk and/or appropriate mitigation measures.";
  } else {
    nslTextContainer.textContent = "Information provided by applicant is believed to be complete and/or sufficient to assess environmental impact and determine mitigation measures without the need for an EIA. Low acute and cumulative risks to human health and the environment have been determined with acceptable confidence. Considerations beyond the scope of this model must be taken into account to justify contrary action.";
  }


  // 4. Draw NSL % chart
		function drawNSLGraph(score, threshold = 75) {
	  const canvas = document.getElementById("nslGraphCanvas");
	  if (!canvas) return;

  // 5. Destroy existing chart if present
	  if (window.nslChart) {
		window.nslChart.destroy();
	  }

	  const ctx = canvas.getContext("2d");
	  const cecRef = storedDAInputs.cecNumber || "CEC";

	  window.nslChart = new Chart(ctx, {
		type: "scatter", // Use scatter to show the NSL point
		data: {
		  datasets: [
			{
			  label: "NSL Score",
			  data: [{ x: 0, y: score }],
			  pointBackgroundColor: score <= threshold ? "green" : "red",
			  pointRadius: 6,
			  pointHoverRadius: 8,
			  showLine: false,
			},
			{
			  label: "Threshold (75%)",
			  type: "line",
			  data: [
				{ x: -1, y: threshold },
				{ x: 1, y: threshold }
			  ],
			  borderColor: "#FFA500",
			  borderWidth: 2,
			  borderDash: [], // solid line
			  pointRadius: 0,
			  fill: false,
			}
		  ]
		},
		options: {
		  responsive: true,
		  scales: {
			x: {
			  display: false, // hide X-axis since only one point
			},
			y: {
			  beginAtZero: true,
			  max: 100,
			  title: {
				display: true,
				text: "NSL Score (%)"
			  }
			}
		  },
		  plugins: {
			legend: {
			  position: "top"
			},
			tooltip: {
			  callbacks: {
				label: ctx => {
				  const value = ctx.raw?.y ?? ctx.raw;
				  return `${ctx.dataset.label}: ${value}%`;
				}
			  }
			}
		  }
		}
	  });
	}

  // 6. Show score and decision
  nslScoreDisplay.textContent = `${nslPercent}%`;
  nslDecisionText.textContent = decision;
  drawNSLGraph(nslPercent);

  modelOutputGenerated = true;

// Check for geometry (point or drawn shape)
if (storedDAInputs.coordinates) {
  document.getElementById("spatialAnalysisSection").style.display = "block";
  document.getElementById("spatialResults").style.display = "none";

  runSpatialAnalysis(storedDAInputs.coordinates).then(results => {
    spatialAnalysisResults = results;
    renderSpatialResults(results);
  });
} else {
  document.getElementById("spatialAnalysisSection").style.display = "none";
}

const outputDate = document.getElementById("outputDate");

const today = new Date();
const day = String(today.getDate()).padStart(2, '0');
const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
const month = monthNames[today.getMonth()];
const year = today.getFullYear();

const formattedDate = `${day}-${month}-${year}`;
outputDate.textContent = `Date: ${formattedDate}`;

}

// Main spatial analysis function
async function runSpatialAnalysis(userGeom) {
  const buffer = turf.buffer(userGeom, 1, { units: "kilometers" });

  const proximityLayers = [
    { name: "Aripo Savannas", layer: geojsonLayers["Aripo Savannas"] },
    { name: "Caroni Swamp", layer: geojsonLayers["Caroni Swamp"] },
    { name: "Forest Reserve", layer: geojsonLayers["Forest Reserve"] },
    { name: "Matura National Park", layer: geojsonLayers["Matura National Park"] },
    { name: "Nariva Swamp", layer: geojsonLayers["Nariva Swamp"] }
  ];
/*
   const intersectLayers = [
   { name: "Municipality", layers: [geojsonLayers["Municipality"]], labelField: "NAME_1", id: "municipalityLabel" },
   { name: "Watershed", layers: [geojsonLayers["Trinidad Watersheds"], geojsonLayers["Tobago Watersheds"]], labelField: "NAME", id: "watershedLabel" },
   { name: "Ecological Susceptibility", layers: [geojsonLayers["Ecological Susceptibility"]], labelField: "Class", id: "ecoLabel" },
   { name: "Geological Susceptibility", layers: [geojsonLayers["Geological Susceptibility"]], labelField: "Class", id: "geoLabel" },
   { name: "Hydrogeology", layers: [geojsonLayers["Hydrogeology"]], labelField: "ATTRIB", id: "hydroLabel" },
   { name: "Social Susceptibility", layers: [geojsonLayers["Social Susceptibility"]], labelField: "Class", id: "socialLabel" },
   { name: "TCPD Policy", layers: [geojsonLayers["Trinidad TCPD Policy"], geojsonLayers["Tobago TCPD Policy"]], labelField: "Class_Name", id: "tcpdLabel" }
 ];
*/

  const receptors = [];

  // Find layers within 1km
  proximityLayers.forEach(item => {
    item.layer.eachLayer(l => {
		if (turf.booleanIntersects(buffer, l.toGeoJSON())) {
		  const isInside = turf.booleanIntersects(userGeom, l.toGeoJSON());
		  let distanceLabel = "within boundaries";

		  if (!isInside) {
			const dist = getShortestDistanceToPolygon(l.toGeoJSON(), userGeom);
			distanceLabel = dist ? `${dist.toFixed(1)*100} m` : "?";
		  }

		 let featureName = item.name;

// Special logic for Forest Reserve
if (item.name === "Forest Reserve") {
  const labelField = labelFields["Forest Reserve"];
  const nameFromFeature = l.feature?.properties?.[labelField];
  if (nameFromFeature && nameFromFeature !== "null") {
    featureName = nameFromFeature;
  }
}

receptors.push({ name: featureName, distance: distanceLabel });
		}
function getShortestDistanceToPolygon(polygon, inputGeom) {
  const line = turf.polygonToLine(polygon);
  const point = turf.centroid(inputGeom); // Or inputGeom if already a point
  const nearest = turf.nearestPointOnLine(line, point);
  return turf.distance(point, nearest, { units: "kilometers" });
}

    });
  });

  // Find intersecting polygon labels
	const intersections = {};

const intersectLayers = [
  {
    name: "Municipality",
    layers: [
      { layer: geojsonLayers["Municipality"], labelField: "NAME_1" }
    ],
    id: "municipalityLabel"
  },
  {
    name: "Watershed",
    layers: [
      { layer: geojsonLayers["Trinidad Watersheds"], labelField: "NAME" },
      { layer: geojsonLayers["Tobago Watersheds"], labelField: "WATERSHED" }
    ],
    id: "watershedLabel"
  },
  {
    name: "Ecological Susceptibility",
    layers: [
      { layer: geojsonLayers["Ecological Susceptibility"], labelField: "Class" }
    ],
    id: "ecoLabel"
  },
  {
    name: "Geological Susceptibility",
    layers: [
      { layer: geojsonLayers["Geological Susceptibility"], labelField: "Class" }
    ],
    id: "geoLabel"
  },
  {
    name: "Hydrogeology",
    layers: [
      { layer: geojsonLayers["Hydrogeology"], labelField: "ATTRIB" }
    ],
    id: "hydroLabel"
  },
  {
    name: "Social Susceptibility",
    layers: [
      { layer: geojsonLayers["Social Susceptibility"], labelField: "Class" }
    ],
    id: "socialLabel"
  },
  {
    name: "TCPD Policy",
    layers: [
      { layer: geojsonLayers["Trinidad TCPD Policy"], labelField: "Class_Name" },
      { layer: geojsonLayers["Tobago TCPD Policy"], labelField: "Class_Name" }
    ],
    id: "tcpdLabel"
  }
];

intersectLayers.forEach(item => {
  const values = new Set();

  item.layers.forEach(({ layer, labelField }) => {
    if (!layer) return; // Skip if layer isn't loaded yet

    layer.eachLayer(l => {
      if (turf.booleanIntersects(userGeom, l.toGeoJSON())) {
        const val = l.feature?.properties?.[labelField];
        if (val && val !== "null") values.add(val);
      }
    });
  });

  intersections[item.id] = Array.from(values).join(", ") || "None";
});


	  // CECs nearby (within 1km)
	  const nearbyCecs = [];
	  
	if (geojsonLayers["CEC Applications"] && geojsonLayers["CEC Applications"].getLayers().length > 0) {
	  geojsonLayers["CEC Applications"].eachLayer(l => {
		if (turf.booleanIntersects(buffer, l.feature)) {
		  const props = l.feature.properties;
		  nearbyCecs.push({
			ref: props.ref,
			year: props.year,
			status: props.status
		  });
		}
	  });
	}

	  return { receptors, intersections, nearbyCecs };
	}

	// Render results to the modal output
	function renderSpatialResults(data) {
	  document.getElementById("spatialResults").style.display = "block";

	  // Receptors
	  const receptorTable = document.querySelector("#receptorsTable tbody");
	  receptorTable.innerHTML = "";
	  data.receptors.forEach(r => {
		const row = `<tr><td>${r.name}</td><td>${r.distance}</td></tr>`;
		receptorTable.innerHTML += row;
	  });

	  // CECs
	  const cecBody = document.getElementById("cecListBody");
	  cecBody.innerHTML = "";
	  data.nearbyCecs.forEach(c => {
		const row = `<tr><td>${c.ref}</td><td>${c.year}</td><td>${c.status}</td></tr>`;
		cecBody.innerHTML += row;
	  });

	  // Label fields
	  for (const id in data.intersections) {
		document.getElementById(id).textContent = data.intersections[id] || "None";
	  }
	}

//-------------------------------------------------------------------------------------------------

let spatialAnalysisResults = null; // Holds results to be reused if modal is reopened

// Toggles CEC list
function toggleCECList() {
  const list = document.getElementById("cecList");
  list.style.display = list.style.display === "none" ? "block" : "none";
}

// Helper: Get distance from feature to geometry
function getMinDistance(geometry1, geometry2) {
  try {
    return turf.distance(turf.center(geometry1), turf.center(geometry2), { units: "meters" });
  } catch {
    return null;
  }
}


//-------------------------------------------------------------------------------------------------

// Helper: Extract numeric sort key
function extractSortKey(code) {
  const match = code.match(/^(\d+)(?:\((\w)\))?/);
  if (!match) return 9999;
  const number = parseInt(match[1], 10);
  const letter = match[2] ? match[2].toLowerCase().charCodeAt(0) : 0;
  return number * 100 + letter;
}

// Helper: Get activity description from designatedActivities
function getActivityDescription(code) {
  const act = designatedActivities.find(a => a.code === code);
  return act ? act.description : "";
}


// NSL Calculation Core Function
function calculateNSLScore() {
  const ratings = storedDAInputs.riskRatings || {};
  let totalScore = 0;
  let count = 0;

  for (const code in ratings) {
    const entry = ratings[code];
    const daRow = da_data.find(row => row.DA === code);

    if (!daRow) continue;

    const weights = {
      Nature: parseFloat(daRow.Nature) || 0,
      Scale: parseFloat(daRow.Scale) || 0,
      Location: parseFloat(daRow.Location) || 0
    };

    const coeffs = {
      Nature: getRiskCoefficient(entry.Nature),
      Scale: getRiskCoefficient(entry.Scale),
      Location: getRiskCoefficient(entry.Location)
    };

    const numerator =
      weights.Nature * coeffs.Nature +
      weights.Scale * coeffs.Scale +
      weights.Location * coeffs.Location;

    const denominator =
      weights.Nature + weights.Scale + weights.Location;

    if (denominator > 0) {
      totalScore += numerator / denominator;
      count++;
    }
  }

  return count > 0 ? totalScore / count : 0;
}

// Helper: Risk rating to coefficient
function getRiskCoefficient(rating) {
  const map = {
    "N/A": 0,
    "Very Low": 0.2,
    "Low": 0.4,
    "Moderate": 0.6,
    "High": 0.8,
    "Very High": 1
  };
  return map[rating] ?? 0;
}

function initializeGeocoderSearch() {
  const input = document.querySelector('.leaflet-control-geocoder-form input');

  if (!input) return;

  input.addEventListener('keyup', function (e) {
    const query = input.value.trim();
    const isEnter = e.key === 'Enter';

    if (!isEnter) return;

    // If empty input, clear marker
    if (query === '') {
      if (searchMarker) {
        map.removeLayer(searchMarker);
        searchMarker = null;
      }
      return;
    }

    // Extract numeric part of CEC Reference
    let numPart = null;
    const cecMatch = query.match(/^CEC\s*-?(\d+)/i);
    if (cecMatch) {
      numPart = cecMatch[1];
    } else if (/^\d+$/.test(query)) {
      numPart = query;
    }

    if (numPart) {
      const parsed = parseInt(numPart);
      const matching = jsonData.find(row => {
        const refNum = parseInt(row["CEC Reference"]);
        return refNum === parsed;
      });

      if (matching) {
        const lat = parseFloat(matching.Latitude);
        const lon = parseFloat(matching.Longitude);
	    
        if (lat !== null && lon !== null) {
          const latlng = [lat, lon];
          if (searchMarker) map.removeLayer(searchMarker);
          searchMarker = L.marker(latlng, { icon: searchIcon }).addTo(map)
            .bindPopup(`
              <p><b>CEC Reference:</b> ${matching["CEC Reference"]}</p>
              <p><b>Year:</b> ${matching["Year"]}</p>
              <p><b>Applicant:</b> ${matching["Applicant"]}</p>
              <p><b>Designated Activity:</b> ${matching["Designated Activity"]}</p>
              <p><b>Location:</b> ${matching["Activity Location"]}</p>
              <p><b>Easting:</b> ${matching["Easting"]}</p>
              <p><b>Northing:</b> ${matching["Northing"]}</p>
              <p><b>Status:</b> ${matching["Application Determination"]}</p>
              <p><b>Determination Date:</b> ${matching["Determination Date"]}</p>
            `)
            .openPopup();
          map.setView(latlng, 17);
        }
      }
    }
  });
}




/*//------------------POSSIBLE FUTURE INCLUSIONS------------------------------------///
- add length measurements for map elements 
- Include DEM for topographic analysis
//---------------------------------------------------------------------------------*///
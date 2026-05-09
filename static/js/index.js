window.HELP_IMPROVE_VIDEOJS = false;

// Define your demos. Adjust the paths and frame counts as needed.
var demos = {
  "demo1": { base: "./static/interpolation/stacked", frames: 119 },
  "demo2": { base: "./static/interpolation/180926", frames: 137 },
  "demo3": { base: "./static/interpolation/300036", frames: 114 },
  "demo4": { base: "./static/interpolation/300183", frames: 62 }
};

// Where your two icons live:
var ICON_BASE = "./static/interpolation";  // Picture1.png & Picture2.png go here

// Current demo key (default to "demo1")
var currentDemoKey = "demo1";

// Set global variables from the current demo.
var INTERP_BASE = demos[currentDemoKey].base;
var NUM_INTERP_FRAMES = demos[currentDemoKey].frames;

var interp_images = [];
var interp_labels = [];     // { skill: string, success: boolean }
var skillMapping = [];      // maps frame idx → instruction idx
var info = null;            // holds info.json data

// Preload info.json.
function preloadInfo() {
  $.getJSON(INTERP_BASE + "/info.json", function(json) {
    info = json;
    console.log("Loaded info:", info);
  }).fail(function(jqxhr, textStatus, error) {
    console.error("Failed to load info.json:", textStatus, error);
  });
}

// Preload all frame images, flagging any missing.
function preloadInterpolationImages() {
  interp_images = [];
  for (var i = 0; i < NUM_INTERP_FRAMES; i++) {
    (function(i) {
      var path = INTERP_BASE + "/frame_" + String(i).padStart(4, "0") + ".png";
      var img = new Image();
      img.onerror = function() {
        console.warn("Image not found: " + path);
        img.failed = true;
      };
      img.src = path;
      interp_images[i] = img;
    })(i);
  }
}

// Preload per-frame labels and build the skill‐to‐instruction mapping.
function preloadInterpolationLabels() {
  interp_labels = [];
  $.getJSON(INTERP_BASE + "/states.json", function(json) {
    for (var i = 0; i < NUM_INTERP_FRAMES; i++) {
      interp_labels[i] = {
        skill: json[i]["Current Skill"],
        success: json[i]["Current Skill Success"]
      };
    }
    skillMapping = [];
    if (NUM_INTERP_FRAMES > 0) {
      skillMapping[0] = 0;
      for (var i = 1; i < NUM_INTERP_FRAMES; i++) {
        if (
          interp_labels[i - 1].success === false &&
          interp_labels[i].success === true
        ) {
          skillMapping[i] = skillMapping[i - 1] + 1;
        } else {
          skillMapping[i] = skillMapping[i - 1];
        }
      }
    }
    console.log("Skill mapping:", skillMapping);
    setInterpolationImage($("#interpolation-slider").val());
  }).fail(function(jqxhr, textStatus, error) {
    console.error("Failed to load states.json:", textStatus, error);
  });
}

// Display a given frame index, with:
//  • Task instruction + icon ABOVE the image (no overlay)
//  • Skill instruction + icon BELOW in a white-overlay band (bold)
function setInterpolationImage(i) {
  var intendedIndex = parseInt(i, 10);
  var displayIndex = intendedIndex;

  // Find the nearest non-failed image forward...
  while (
    displayIndex < NUM_INTERP_FRAMES &&
    (!interp_images[displayIndex] || interp_images[displayIndex].failed)
  ) {
    displayIndex++;
  }
  // ...or backward if none ahead.
  if (displayIndex >= NUM_INTERP_FRAMES) {
    displayIndex = intendedIndex;
    while (
      displayIndex >= 0 &&
      (!interp_images[displayIndex] || interp_images[displayIndex].failed)
    ) {
      displayIndex--;
    }
    if (displayIndex < 0) {
      $("#interpolation-image-wrapper")
        .empty()
        .append('<div class="error">No valid frame available.</div>');
      return;
    }
  }

  var image = interp_images[displayIndex];
  $(image).css({
    "max-width": "600px",
    width: "100%",
    height: "auto"
  });

  // Lookup raw state + compute instruction index
  var state = interp_labels[intendedIndex] || {};
  var rawSkill = state.skill || "Frame " + intendedIndex;
  var instrIndex = skillMapping[intendedIndex] || 0;
  if (
    info &&
    info.skill_instructions &&
    instrIndex >= info.skill_instructions.length
  ) {
    instrIndex = info.skill_instructions.length - 1;
  }

  // Final texts
  var taskInstr = info && info.task_instruction ? info.task_instruction : "";
  var skillName = rawSkill;
  var skillInstr = "";
  if (info && info.chain_params && info.skill_instructions) {
    skillName = info.chain_params[instrIndex].skill_name;
    skillInstr = info.skill_instructions[instrIndex];
  }
  var skillText =
    skillName.toUpperCase() + (skillInstr ? ": " + skillInstr : "");

  // Icon sources
  var taskIconSrc = ICON_BASE + "/Picture1.png";
  var skillIconSrc = ICON_BASE + "/Picture2.png";

  // Build the outer wrapper
  var wrapper = $('<div class="image-wrapper"></div>').css({
    "max-width": "600px",
    margin: "0 auto",
    "text-align": "center",
    padding: "10px",
    position: "relative"
  });

  // — Task instruction ABOVE the image (no overlay)
  if (taskInstr) {
    var taskLabel = $('<div class="task-label"></div>').css({
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: '100%',
      "font-size": "20px",
      "font-family": "Georgia, serif",
      color: "#333",
      "margin-bottom": "10px"
    });
    
    // Create wrapper for icon and text to keep them together
    var taskContent = $('<div class="task-content"></div>').css({
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    });
    
    var taskIcon = $("<img>")
      .attr("src", taskIconSrc)
      .css({
        width: "24px",
        height: "32px",
        "margin-right": "8px"
      });
    
    taskContent.append(taskIcon).append(taskInstr);
    taskLabel.append(taskContent);
    wrapper.append(taskLabel);
  }

  // — Image container
  var imageContainer = $('<div class="image-container"></div>').css({
    position: "relative",
    display: "inline-block",
    width: "100%"
  });
  imageContainer.append(image);

  // — Skill overlay at bottom (with icon + bold text)
  if (skillText) {
    var bottomBand = $('<div class="skill-instruction-band"></div>').css({
      position: "absolute",
      bottom: "0",
      left: "0",
      width: "100%",
      "background-color": "rgba(255,255,255,0.8)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "10px",
      "box-sizing": "border-box",
      "font-size": "16px",
      "font-family": "Arial, sans-serif",
      color: "#000"
    });
    
    // Create wrapper for icon and text to keep them together
    var skillContent = $('<div class="skill-content"></div>').css({
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    });
    
    var skillIcon = $("<img>")
      .attr("src", skillIconSrc)
      .css({
        width: "24px",
        height: "24px",
        "margin-right": "8px"
      });
    
    skillContent.append(skillIcon).append($("<strong>").text(skillText));
    bottomBand.append(skillContent);
    imageContainer.append(bottomBand);
  }

  // Put it all together
  wrapper.append(imageContainer);
  $("#interpolation-image-wrapper").empty().append(wrapper);
}

// Switch demos, reload everything
function loadDemo(demoKey) {
  currentDemoKey = demoKey;
  INTERP_BASE = demos[demoKey].base;
  NUM_INTERP_FRAMES = demos[demoKey].frames;

  $("#interpolation-slider").val(0).prop("max", NUM_INTERP_FRAMES - 1);

  info = null;
  interp_images = [];
  interp_labels = [];
  skillMapping = [];

  preloadInfo();
  preloadInterpolationImages();
  preloadInterpolationLabels();
  setInterpolationImage(0);
}

$(document).ready(function() {
  // Demo selector
  $("#demo-selector").on("change", function() {
    loadDemo($(this).val());
  });

  // Mobile navbar toggle (Bulma)
  $(".navbar-burger").click(function() {
    $(".navbar-burger, .navbar-menu").toggleClass("is-active");
  });

  // Bulma carousel init (optional)
  var carousels = bulmaCarousel.attach(".carousel", {
    slidesToScroll: 1,
    slidesToShow: 3,
    loop: true,
    infinite: true,
    autoplay: false,
    autoplaySpeed: 3000
  });
  carousels.forEach(c => c.on("before:show", s => console.log(s)));

  // Preload default demo
  preloadInfo();
  preloadInterpolationImages();
  preloadInterpolationLabels();
  setInterpolationImage(0);

  // Slider handler
  $("#interpolation-slider").on("input", function() {
    setInterpolationImage(this.value);
  });
});

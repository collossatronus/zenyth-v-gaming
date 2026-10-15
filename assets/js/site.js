(() => {
  const backgroundKey = "zenyth-v-background";
  const backgrounds = {
    electric: "#147acb",
    aurora: "#168f84",
    violet: "#7540bb"
  };
  let selectedBackground = "electric";

  try {
    const savedBackground = localStorage.getItem(backgroundKey);
    if (savedBackground && Object.hasOwn(backgrounds, savedBackground)) {
      selectedBackground = savedBackground;
    }
  } catch {
    selectedBackground = "electric";
    console.warn("The saved background could not be read in this browser.");
  }

  const atmosphere = document.createElement("div");
  atmosphere.className = "personal-background";
  atmosphere.setAttribute("aria-hidden", "true");
  function applyBackground(background) {
    if (!Object.hasOwn(backgrounds, background)) return;
    selectedBackground = background;
    atmosphere.style.setProperty("--personal-glow", backgrounds[selectedBackground]);
  }
  applyBackground(selectedBackground);
  document.body.prepend(atmosphere);
  window.zenythApplyBackground = applyBackground;

  const config = window.ZENYTH_CONFIG;
  if (config?.supabaseUrl && config?.supabaseAnonKey) {
    import("https://esm.sh/@supabase/supabase-js@2")
      .then(async ({ createClient }) => {
        const client = createClient(config.supabaseUrl, config.supabaseAnonKey);
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        const background = data.session?.user.user_metadata?.site_background;
        if (background && Object.hasOwn(backgrounds, background)) {
          applyBackground(background);
          try {
            localStorage.setItem(backgroundKey, background);
          } catch {
            console.warn("The saved profile background could not be cached in this browser.");
          }
        }
      })
      .catch((error) => console.error("Could not load the saved profile background:", error));
  }

  const canvas = document.createElement("canvas");
  canvas.className = "ambient-lightning";
  canvas.setAttribute("aria-hidden", "true");
  document.body.append(canvas);

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const context = canvas.getContext("2d");
  if (!context) return;

  let frame = 0;
  let timer = 0;
  let bolt = null;

  function resizeCanvas() {
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * scale);
    canvas.height = Math.round(window.innerHeight * scale);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    context.setTransform(scale, 0, 0, scale, 0, 0);
  }

  function drawPath(points, width, alpha) {
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    context.lineWidth = width;
    context.globalAlpha = alpha;
    context.strokeStyle = "#f5fcff";
    context.shadowColor = "#c5efff";
    context.shadowBlur = 12;
    context.stroke();
  }

  function makeBolt(startX, endY, spread, steps) {
    const points = [{ x: startX, y: -12 }];
    for (let index = 1; index <= steps; index += 1) {
      points.push({
        x: points[index - 1].x + (Math.random() - 0.5) * spread,
        y: (endY / steps) * index
      });
    }
    return points;
  }

  function drawFrame(now) {
    if (!bolt) return;
    const progress = Math.min((now - bolt.startedAt) / bolt.duration, 1);
    const envelope = Math.sin(Math.PI * progress);
    context.clearRect(0, 0, window.innerWidth, window.innerHeight);
    drawPath(bolt.points, 2.1, envelope * 0.36);

    bolt.branches.forEach((branch) => drawPath(branch, 1.1, envelope * 0.23));
    if (progress < 1) {
      frame = window.requestAnimationFrame(drawFrame);
    } else {
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
      bolt = null;
      scheduleFlash(8000 + Math.random() * 19000);
    }
  }

  function strike() {
    if (document.hidden) {
      scheduleFlash(7000 + Math.random() * 18000);
      return;
    }

    const startX = window.innerWidth * (0.1 + Math.random() * 0.8);
    const main = makeBolt(startX, window.innerHeight * (0.35 + Math.random() * 0.4), 48, 12);
    const branches = [];

    for (let index = 0; index < 2 + Math.floor(Math.random() * 3); index += 1) {
      const originIndex = 3 + Math.floor(Math.random() * (main.length - 5));
      const origin = main[originIndex];
      const direction = Math.random() < 0.5 ? -1 : 1;
      const branch = [{ x: origin.x, y: origin.y }];
      for (let step = 1; step <= 4; step += 1) {
        branch.push({
          x: branch[step - 1].x + direction * (7 + Math.random() * 11),
          y: branch[step - 1].y + 9 + Math.random() * 13
        });
      }
      branches.push(branch);
    }

    bolt = { points: main, branches, startedAt: performance.now(), duration: 240 + Math.random() * 190 };
    frame = window.requestAnimationFrame(drawFrame);
  }

  function scheduleFlash(delay) {
    window.clearTimeout(timer);
    timer = window.setTimeout(strike, delay);
  }

  resizeCanvas();
  window.addEventListener("resize", resizeCanvas, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
      bolt = null;
    } else if (!bolt) {
      scheduleFlash(7000 + Math.random() * 18000);
    }
  });
  scheduleFlash(5000 + Math.random() * 14000);
})();

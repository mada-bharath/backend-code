const apiBase = (() => {
  const configuredApi =
    window.BHARATHVIDYA_API_URL ||
    document.querySelector('meta[name="api-base"]')?.content ||
    "";

  if (configuredApi) {
    return configuredApi.replace(/\/$/, "");
  }

  if (window.location.origin?.startsWith("http")) {
    return `${window.location.origin}/api`;
  }
  return "http://localhost:5000/api";
})();

const state = {
  token: localStorage.getItem("bv_token") || "",
  user: null,
  courses: [],
  courseData: null,
  progress: {},
  activeIndex: -1,
  activeMaterial: null,
  materialZoom: 100,
  lastSaveAt: 0,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const els = {
  authView: $("#authView"),
  coursesView: $("#coursesView"),
  playerView: $("#playerView"),
  accountView: $("#accountView"),
  loginForm: $("#loginForm"),
  authStatus: $("#authStatus"),
  sessionName: $("#sessionName"),
  logoutButton: $("#logoutButton"),
  courseGrid: $("#courseGrid"),
  courseIdForm: $("#courseIdForm"),
  courseIdInput: $("#courseIdInput"),
  courseTitle: $("#courseTitle"),
  courseTutor: $("#courseTutor"),
  courseProgressLabel: $("#courseProgressLabel"),
  courseProgressBar: $("#courseProgressBar"),
  modulesPanel: $("#modulesPanel"),
  materialsList: $("#materialsList"),
  mediaFrame: $("#mediaFrame"),
  lessonVideo: $("#lessonVideo"),
  materialFrame: $("#materialFrame"),
  emptyState: $("#emptyState"),
  playButton: $("#playButton"),
  muteButton: $("#muteButton"),
  qualitySelect: $("#qualitySelect"),
  languageSelect: $("#languageSelect"),
  fullscreenButton: $("#fullscreenButton"),
  previousButton: $("#previousButton"),
  nextButton: $("#nextButton"),
  completeButton: $("#completeButton"),
  downloadAttachmentButton: $("#downloadAttachmentButton"),
  zoomOutButton: $("#zoomOutButton"),
  zoomInButton: $("#zoomInButton"),
  printButton: $("#printButton"),
  materialFullscreenButton: $("#materialFullscreenButton"),
  pageLabel: $("#pageLabel"),
  profileForm: $("#profileForm"),
  profileName: $("#profileName"),
  profileEmail: $("#profileEmail"),
  profilePhone: $("#profilePhone"),
  profileBio: $("#profileBio"),
  passwordForm: $("#passwordForm"),
  currentPassword: $("#currentPassword"),
  newPassword: $("#newPassword"),
  billingList: $("#billingList"),
  accountStatus: $("#accountStatus"),
};

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatSeconds(seconds = 0) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function setStatus(element, message, success = false) {
  element.textContent = message || "";
  element.classList.toggle("success", Boolean(success));
}

async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.success === false) {
    throw new Error(data.message || `Request failed: ${response.status}`);
  }

  return data;
}

function showView(viewId) {
  $$(".view").forEach((view) => view.classList.remove("active"));
  $$(".nav-item").forEach((button) =>
    button.classList.toggle("active", button.dataset.view === viewId)
  );

  if (!state.token && viewId !== "authView") {
    els.authView.classList.add("active");
    return;
  }

  $(`#${viewId}`).classList.add("active");
}

function flattenVideos() {
  if (!state.courseData) return [];
  return state.courseData.sections.flatMap((section) =>
    (section.videos || [])
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((video) => ({ ...video, sectionId: section._id, sectionTitle: section.title }))
  );
}

function allMaterials() {
  if (!state.courseData) return [];
  return state.courseData.sections.flatMap((section) =>
    (section.studyMaterials || []).map((material) => ({
      ...material,
      sectionId: section._id,
      sectionTitle: section.title,
    }))
  );
}

function currentVideo() {
  return flattenVideos()[state.activeIndex] || null;
}

function currentSectionMaterials() {
  const video = currentVideo();
  if (!video || !state.courseData) return allMaterials();
  const section = state.courseData.sections.find((item) => String(item._id) === String(video.sectionId));
  return section?.studyMaterials || [];
}

function hydrateUser(user) {
  state.user = user;
  els.sessionName.textContent = user?.name || user?.email || "Learner";
  els.profileName.value = user?.name || "";
  els.profileEmail.value = user?.email || "";
  els.profilePhone.value = user?.phone || "";
  els.profileBio.value = user?.bio || "";
}

async function loadSession() {
  if (!state.token) {
    showView("authView");
    return;
  }

  try {
    const me = await api("/auth/me");
    hydrateUser(me.user || me.data);
    await loadCourses();
    renderBilling();
    showView("coursesView");
  } catch (error) {
    localStorage.removeItem("bv_token");
    state.token = "";
    setStatus(els.authStatus, error.message);
    showView("authView");
  }
}

async function loadCourses() {
  const response = await api("/users/me/courses");
  state.courses = response.data || [];
  renderCourses();
}

function renderCourses() {
  if (!state.courses.length) {
    els.courseGrid.innerHTML = `<div class="course-card"><h2>No courses found</h2><p class="meta-line">Open a course by ID.</p></div>`;
    return;
  }

  els.courseGrid.innerHTML = state.courses
    .map((course) => {
      const image = course.thumbnail
        ? `<img src="${escapeHtml(course.thumbnail)}" alt="${escapeHtml(course.title)}">`
        : "";
      return `
        <article class="course-card">
          ${image}
          <h2>${escapeHtml(course.title)}</h2>
          <p class="meta-line">
            <span class="pill">${escapeHtml(course.level || "All Levels")}</span>
            <span class="pill">${course.isFree ? "Free" : `Rs ${course.finalPrice || 0}`}</span>
          </p>
          <button class="primary-button" type="button" data-open-course="${course._id}">Open Player</button>
        </article>
      `;
    })
    .join("");
}

async function openCourse(courseId) {
  if (!courseId) return;

  const [player, progress] = await Promise.all([
    api(`/media/course/${courseId}`),
    api(`/progress/${courseId}`).catch(() => ({ progressByVideo: {}, percentage: 0, lastVideo: null })),
  ]);

  state.courseData = player.data;
  state.progress = progress.progressByVideo || {};

  const videos = flattenVideos();
  const lastIndex = videos.findIndex((video) => String(video._id) === String(progress.lastVideo));
  state.activeIndex = lastIndex >= 0 ? lastIndex : videos.findIndex((video) => !video.isLocked);
  if (state.activeIndex < 0) state.activeIndex = 0;

  renderPlayer(progress.percentage || 0);
  showView("playerView");

  if (videos.length) loadVideo(state.activeIndex);
}

function renderPlayer(progressPercentage = 0) {
  const data = state.courseData;
  const course = data?.course || {};
  const tutor = course.assignedInstructors?.find((item) => item?.instructor?.name)?.instructor?.name;

  els.courseTitle.textContent = course.title || "Course Player";
  els.courseTutor.textContent = tutor ? `Tutor: ${tutor}` : "Tutor";
  els.courseProgressLabel.textContent = `${progressPercentage}%`;
  els.courseProgressBar.style.width = `${progressPercentage}%`;

  renderModules();
  renderMaterials();
}

function renderModules() {
  const videos = flattenVideos();
  els.modulesPanel.innerHTML = (state.courseData?.sections || [])
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((section) => {
      const rows = (section.videos || [])
        .sort((a, b) => (a.order || 0) - (b.order || 0))
        .map((video) => {
          const index = videos.findIndex((item) => String(item._id) === String(video._id));
          const saved = state.progress[String(video._id)] || {};
          const done = saved.completed ? "Completed" : `${saved.progress || 0}%`;
          return `
            <button class="lesson-row ${index === state.activeIndex ? "active" : ""} ${video.isLocked ? "locked" : ""}" type="button" data-video-index="${index}">
              <strong>${escapeHtml(video.title)}</strong>
              <small>${video.isLocked ? "Locked" : `${formatSeconds(video.duration)} - ${done}`}</small>
            </button>
          `;
        })
        .join("");

      return `
        <section class="module-block">
          <div class="module-title">
            <span>${escapeHtml(section.title)}</span>
            <span>${(section.videos || []).length}</span>
          </div>
          ${rows || `<div class="lesson-row"><small>No lessons</small></div>`}
        </section>
      `;
    })
    .join("");
}

function renderMaterials() {
  const materials = allMaterials();

  if (!materials.length) {
    els.materialsList.innerHTML = `<div class="material-row"><strong>No study materials</strong><small>Materials appear module wise when uploaded by instructor or admin.</small></div>`;
    return;
  }

  els.materialsList.innerHTML = materials
    .map((material) => `
      <article class="material-row">
        <strong>${escapeHtml(material.title)}</strong>
        <small>${escapeHtml(material.sectionTitle)} - ${escapeHtml(material.category || material.type || "material")}</small>
        <div class="material-actions">
          <button class="secondary-button" type="button" data-preview-material="${material._id}">Open</button>
          <a class="secondary-button" href="${escapeHtml(material.fileUrl || "#")}" target="_blank" rel="noreferrer">Download</a>
        </div>
      </article>
    `)
    .join("");
}

function loadVideo(index) {
  const videos = flattenVideos();
  const video = videos[index];
  if (!video) return;

  state.activeIndex = index;
  state.activeMaterial = null;
  els.mediaFrame.classList.remove("show-material");
  els.mediaFrame.classList.add("show-video");
  els.materialFrame.removeAttribute("src");
  els.lessonVideo.src = video.hlsUrl || video.videoUrl || "";
  els.lessonVideo.muted = false;
  els.playButton.textContent = "Play";

  const saved = state.progress[String(video._id)] || {};
  els.lessonVideo.onloadedmetadata = () => {
    if (saved.watchedTime && saved.watchedTime < els.lessonVideo.duration - 8) {
      els.lessonVideo.currentTime = saved.watchedTime;
    }
  };

  renderModules();
}

function showMaterial(materialId) {
  const material = allMaterials().find((item) => String(item._id) === String(materialId));
  if (!material || !material.fileUrl) return;

  state.activeMaterial = material;
  state.materialZoom = 100;
  els.lessonVideo.pause();
  els.lessonVideo.removeAttribute("src");
  els.lessonVideo.load();
  els.mediaFrame.classList.remove("show-video");
  els.mediaFrame.classList.add("show-material");
  renderMaterialFrame();
}

function renderMaterialFrame() {
  if (!state.activeMaterial) return;
  const zoom = `#zoom=${state.materialZoom}`;
  els.materialFrame.src = `${state.activeMaterial.fileUrl}${zoom}`;
  els.pageLabel.textContent = `${state.materialZoom}%`;
}

async function saveVideoProgress(forceProgress) {
  const video = currentVideo();
  if (!video || video.isLocked || !state.courseData) return;

  const now = Date.now();
  if (forceProgress === undefined && now - state.lastSaveAt < 10000) return;
  state.lastSaveAt = now;

  const duration = els.lessonVideo.duration || video.duration || 0;
  const watchedTime = els.lessonVideo.currentTime || 0;
  const progress =
    forceProgress !== undefined
      ? forceProgress
      : duration
        ? Math.round((watchedTime / duration) * 100)
        : 0;

  const response = await api("/progress", {
    method: "POST",
    body: JSON.stringify({
      courseId: state.courseData.course._id,
      videoId: video._id,
      progress,
      watchedTime,
      duration,
    }),
  });

  state.progress[String(video._id)] = response.progress;
  const courseProgress = await api(`/progress/${state.courseData.course._id}`).catch(() => null);
  if (courseProgress) {
    state.progress = courseProgress.progressByVideo || state.progress;
    els.courseProgressLabel.textContent = `${courseProgress.percentage || 0}%`;
    els.courseProgressBar.style.width = `${courseProgress.percentage || 0}%`;
  }
  renderModules();
}

function downloadCurrentAttachment() {
  const material = currentSectionMaterials()[0] || allMaterials()[0];
  if (!material?.fileUrl) return;
  window.open(material.fileUrl, "_blank", "noopener,noreferrer");
}

function renderBilling() {
  if (!state.courses.length) {
    els.billingList.innerHTML = `<div class="billing-row"><strong>No billing records</strong><small>No active course purchases found.</small></div>`;
    return;
  }

  els.billingList.innerHTML = state.courses
    .map((course) => `
      <article class="billing-row">
        <strong>${escapeHtml(course.title)}</strong>
        <small>${course.isFree ? "Free access" : `Course fee: Rs ${course.finalPrice || 0}`}</small>
      </article>
    `)
    .join("");
}

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus(els.authStatus, "");

  try {
    const response = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: $("#emailInput").value,
        password: $("#passwordInput").value,
      }),
    });

    state.token = response.token;
    localStorage.setItem("bv_token", response.token);
    hydrateUser(response.user);
    await loadCourses();
    renderBilling();
    showView("coursesView");
  } catch (error) {
    setStatus(els.authStatus, error.message);
  }
});

els.logoutButton.addEventListener("click", () => {
  localStorage.removeItem("bv_token");
  state.token = "";
  state.user = null;
  state.courses = [];
  state.courseData = null;
  els.lessonVideo.pause();
  showView("authView");
});

$$(".nav-item").forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.view));
});

document.addEventListener("click", async (event) => {
  const courseButton = event.target.closest("[data-open-course]");
  const videoButton = event.target.closest("[data-video-index]");
  const materialButton = event.target.closest("[data-preview-material]");

  if (courseButton) {
    await openCourse(courseButton.dataset.openCourse).catch((error) => alert(error.message));
  }

  if (videoButton) {
    loadVideo(Number(videoButton.dataset.videoIndex));
  }

  if (materialButton) {
    showMaterial(materialButton.dataset.previewMaterial);
  }
});

els.courseIdForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await openCourse(els.courseIdInput.value.trim()).catch((error) => alert(error.message));
});

$$(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const scope = tab.closest(".content-panel, #accountView");
    scope.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    scope.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
    tab.classList.add("active");
    scope.querySelector(`#${tab.dataset.panel}`).classList.add("active");
  });
});

els.playButton.addEventListener("click", () => {
  if (els.lessonVideo.paused) {
    els.lessonVideo.play();
  } else {
    els.lessonVideo.pause();
  }
});

els.lessonVideo.addEventListener("play", () => {
  els.playButton.textContent = "Pause";
});

els.lessonVideo.addEventListener("pause", () => {
  els.playButton.textContent = "Play";
  saveVideoProgress().catch(() => {});
});

els.lessonVideo.addEventListener("timeupdate", () => {
  saveVideoProgress().catch(() => {});
});

els.lessonVideo.addEventListener("ended", () => {
  saveVideoProgress(100).catch(() => {});
});

els.muteButton.addEventListener("click", () => {
  els.lessonVideo.muted = !els.lessonVideo.muted;
  els.muteButton.textContent = els.lessonVideo.muted ? "Muted" : "Sound";
});

els.fullscreenButton.addEventListener("click", () => {
  els.mediaFrame.requestFullscreen?.();
});

els.materialFullscreenButton.addEventListener("click", () => {
  els.mediaFrame.requestFullscreen?.();
});

els.previousButton.addEventListener("click", () => {
  if (state.activeIndex > 0) loadVideo(state.activeIndex - 1);
});

els.nextButton.addEventListener("click", () => {
  const videos = flattenVideos();
  if (state.activeIndex < videos.length - 1) loadVideo(state.activeIndex + 1);
});

els.completeButton.addEventListener("click", () => {
  saveVideoProgress(100).catch((error) => alert(error.message));
});

els.downloadAttachmentButton.addEventListener("click", downloadCurrentAttachment);

els.zoomInButton.addEventListener("click", () => {
  state.materialZoom = Math.min(200, state.materialZoom + 25);
  renderMaterialFrame();
});

els.zoomOutButton.addEventListener("click", () => {
  state.materialZoom = Math.max(50, state.materialZoom - 25);
  renderMaterialFrame();
});

els.printButton.addEventListener("click", () => {
  if (!state.activeMaterial?.fileUrl) return;
  const popup = window.open(state.activeMaterial.fileUrl, "_blank", "noopener,noreferrer");
  popup?.print?.();
});

els.profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus(els.accountStatus, "");

  try {
    const response = await api("/users/me", {
      method: "PUT",
      body: JSON.stringify({
        name: els.profileName.value,
        email: els.profileEmail.value,
        phone: els.profilePhone.value,
        bio: els.profileBio.value,
      }),
    });
    hydrateUser(response.data);
    setStatus(els.accountStatus, "Profile saved", true);
  } catch (error) {
    setStatus(els.accountStatus, error.message);
  }
});

els.passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus(els.accountStatus, "");

  try {
    await api("/users/me/password", {
      method: "PUT",
      body: JSON.stringify({
        currentPassword: els.currentPassword.value,
        newPassword: els.newPassword.value,
      }),
    });
    els.passwordForm.reset();
    setStatus(els.accountStatus, "Password updated", true);
  } catch (error) {
    setStatus(els.accountStatus, error.message);
  }
});

els.qualitySelect.addEventListener("change", () => {
  els.qualitySelect.title = `Clarity: ${els.qualitySelect.value}`;
});

els.languageSelect.addEventListener("change", () => {
  els.languageSelect.title = `Language: ${els.languageSelect.value}`;
});

loadSession();

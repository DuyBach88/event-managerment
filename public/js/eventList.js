let currentPage = 1;
let currentSearchQuery = "";
let currentSearchType = "title";

function updateSearchInput() {
  const searchType = document.getElementById("searchType").value;
  const searchInput = document.getElementById("searchInput");

  if (searchType === "date") {
    searchInput.type = "date";
    searchInput.placeholder = "Select date...";
  } else {
    searchInput.type = "text";
    searchInput.placeholder = `Search by ${searchType}...`;
  }
}

function renderEvents(data) {
  const tbody = document.getElementById("eventTableBody");
  if (!data.events.length) {
    tbody.innerHTML =
      '<tr><td colspan="8" class="text-center">No events found</td></tr>';
    return;
  }

  tbody.innerHTML = data.events
    .map(
      (event, index) => `
        <tr>
            <td>${(data.currentPage - 1) * 5 + index + 1}</td>
            <td>${event.title || "No title"}</td>
            <td>${new Date(event.date).toLocaleDateString()}</td>
            <td>${event.startTime || "Not set"} - ${
        event.endTime || "Not set"
      }</td>
            <td>${event.location}</td>
            <td>${
              event.mainSpeaker ? event.mainSpeaker.fullName : "Not assigned"
            }</td>
            <td>${
              event.otherSpeaker && event.otherSpeaker.length
                ? event.otherSpeaker.map((s) => s.fullName).join("<br>")
                : "No other speakers"
            }</td>
            <td>
                <a href="/event/update/${
                  event._id
                }" class="btn btn-primary crud">Edit</a>
                <button class="btn btn-danger crud" onclick="deleteEvent('${
                  event._id
                }')">Delete</button>
            </td>
        </tr>
    `
    )
    .join("");
}

function renderPagination(totalPages, currentPage) {
  const pagination = document.getElementById("pagination");
  let html = "";

  // First page
  if (currentPage > 1) {
    html += `
      <li class="page-item">
        <a class="page-link" href="#" data-page="1" title="First page">
          <i class="fa fa-angle-double-left"></i>
        </a>
      </li>
    `;
  }

  // Previous
  if (currentPage > 1) {
    html += `
      <li class="page-item">
        <a class="page-link" href="#" data-page="${currentPage - 1}">
          <i class="fa fa-angle-left"></i>
        </a>
      </li>
    `;
  }

  // Page numbers
  for (
    let i = Math.max(1, currentPage - 2);
    i <= Math.min(totalPages, currentPage + 2);
    i++
  ) {
    html += `
      <li class="page-item ${i === currentPage ? "active" : ""}">
        <a class="page-link" href="#" data-page="${i}">${i}</a>
      </li>
    `;
  }

  // Next
  if (currentPage < totalPages) {
    html += `
      <li class="page-item">
        <a class="page-link" href="#" data-page="${currentPage + 1}">
          <i class="fa fa-angle-right"></i>
        </a>
      </li>
    `;
  }

  // Last page
  if (currentPage < totalPages) {
    html += `
      <li class="page-item">
        <a class="page-link" href="#" data-page="${totalPages}" title="Last page">
          <i class="fa fa-angle-double-right"></i>
        </a>
      </li>
    `;
  }

  pagination.innerHTML = html;
}

async function loadEvents(page = 1) {
  const loader = document.getElementById("loadingIndicator");
  loader.style.display = "block";

  try {
    let url = `/event/search?page=${page}`;
    if (currentSearchQuery) {
      url += `&query=${encodeURIComponent(
        currentSearchQuery
      )}&type=${currentSearchType}`;
    }

    const response = await fetch(url);
    const data = await response.json();

    renderEvents(data);
    renderPagination(data.totalPages, data.currentPage);
    currentPage = data.currentPage;
  } catch (error) {
    console.error("Error loading events:", error);
  } finally {
    loader.style.display = "none";
  }
}

async function deleteEvent(eventId) {
  // Show confirmation dialog
  if (
    !confirm(
      "Are you sure you want to delete this event? This action cannot be undone."
    )
  ) {
    return;
  }

  const loader = document.getElementById("loadingIndicator");
  loader.style.display = "block";

  try {
    const response = await fetch("/event/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ eventId }),
    });

    const data = await response.json();

    if (data.success) {
      // Show success message
      alert(data.message);
      // Reload events list
      loadEvents(currentPage);
    } else {
      alert(data.message || "Error deleting event");
    }
  } catch (error) {
    console.error("Error:", error);
    alert("An error occurred while deleting the event");
  } finally {
    loader.style.display = "none";
  }
}

// Event Listeners
document.addEventListener("DOMContentLoaded", () => {
  // Use server-provided values or defaults
  currentPage = window.currentPage || 1;

  // Initial load using current page
  loadEvents(currentPage);

  document
    .getElementById("searchType")
    .addEventListener("change", updateSearchInput);

  document.getElementById("searchBtn").addEventListener("click", () => {
    currentSearchQuery = document.getElementById("searchInput").value;
    currentSearchType = document.getElementById("searchType").value;
    loadEvents(1);
  });

  document.getElementById("resetBtn").addEventListener("click", () => {
    document.getElementById("searchInput").value = "";
    currentSearchQuery = "";
    currentSearchType = "title";
    document.getElementById("searchType").value = "title";
    updateSearchInput();
    loadEvents(1);
  });

  document.getElementById("pagination").addEventListener("click", (e) => {
    e.preventDefault();
    if (e.target.classList.contains("page-link")) {
      const page = parseInt(e.target.dataset.page);
      loadEvents(page);
    }
  });
});

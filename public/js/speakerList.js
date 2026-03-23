let searchTimeout;

// Handle search input with debouncing
$("#searchInput").on("input", function () {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    performSearch($(this).val(), 1);
  }, 500);
});

function changePage(pageNumber) {
  const currentUrl = new URL(window.location.href);
  const searchQuery = document.getElementById("searchInput")?.value || "";

  currentUrl.searchParams.set("page", pageNumber);
  if (searchQuery) {
    currentUrl.searchParams.set("search", searchQuery);
  }

  window.location.href = currentUrl.toString();
}

document
  .getElementById("searchInput")
  ?.addEventListener("keypress", function (e) {
    if (e.key === "Enter") {
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set("search", this.value);
      currentUrl.searchParams.set("page", 1); // Reset to first page on new search
      window.location.href = currentUrl.toString();
    }
  });

function performSearch(query, page) {
  const url = new URL(window.location.href);
  url.searchParams.set("search", query);
  url.searchParams.set("page", page);

  window.location.href = url.toString();
}

function deleteSpeaker(speakerId, element) {
  if (confirm("Are you sure you want to delete this speaker?")) {
    $.ajax({
      url: "/speaker/delete",
      method: "POST",
      data: { speakerId: speakerId },
      success: function (response) {
        $(element).closest("tr").remove();
        alert("Speaker deleted successfully!");
      },
      error: function (err) {
        console.error(err);
        alert("Error deleting speaker!");
      },
    });
  }
}

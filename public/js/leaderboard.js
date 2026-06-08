const leaderboardBody = document.getElementById("leaderboardBody");
const boardMessage = document.getElementById("boardMessage");
const refreshButton = document.getElementById("refreshButton");

function showBoardMessage(text, isError = false) {
	boardMessage.hidden = false;
	boardMessage.textContent = text;
	boardMessage.className = isError ? "message message-error" : "message";
}

function renderRows(rows) {
	leaderboardBody.innerHTML = "";

	if (!rows.length) {
		leaderboardBody.innerHTML = "<tr><td colspan='7'>No players yet.</td></tr>";
		return;
	}

	rows.forEach(row => {
		const tr = document.createElement("tr");
		tr.innerHTML = `
			<td>#${row.rank}</td>
			<td>${row.name}</td>
			<td>${window.bj.formatMoney(row.balance)}</td>
			<td>${row.wins}</td>
			<td>${row.losses}</td>
			<td>${row.pushes}</td>
			<td>${row.gamesPlayed}</td>
		`;
		leaderboardBody.appendChild(tr);
	});
}

async function loadLeaderboard() {
	try {
		const response = await fetch("/api/leaderboard");

		if (!response.ok) {
			throw new Error("Failed to fetch leaderboard.");
		}

		const data = await response.json();
		renderRows(data.leaderboard || []);
		showBoardMessage(`Updated: ${new Date().toLocaleTimeString()}`);
	}
	catch (error) {
		showBoardMessage(error.message, true);
	}
}

window.socket.on("leaderboardUpdated", rows => {
	renderRows(rows || []);
});

refreshButton.addEventListener("click", loadLeaderboard);
loadLeaderboard();

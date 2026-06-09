
const data = [
    {kabupaten:"Surabaya", indeks:83.7, aps:98.1, rls:11.5, melek:99.1, cluster:"High-High"},
    {kabupaten:"Malang", indeks:78.5, aps:96.4, rls:10.9, melek:98.5, cluster:"High-High"},
    {kabupaten:"Sidoarjo", indeks:72.3, aps:95.8, rls:10.4, melek:98.0, cluster:"High-High"},
    {kabupaten:"Jember", indeks:64.2, aps:91.5, rls:8.8, melek:95.1, cluster:"Low-Low"},
    {kabupaten:"Banyuwangi", indeks:63.1, aps:90.1, rls:8.5, melek:94.5, cluster:"Low-Low"},
    {kabupaten:"Sampang", indeks:19.3, aps:65.3, rls:4.2, melek:70.4, cluster:"Low-Low"}
];

const filter = document.getElementById("clusterFilter");
const tableBody = document.getElementById("tableBody");

let chart;

function renderDashboard(selected="all") {

    let filtered = selected === "all"
        ? data
        : data.filter(d => d.cluster === selected);

    // Metrics
    let avg = (
        filtered.reduce((a,b)=>a+b.indeks,0) / filtered.length
    ).toFixed(2);

    let best = filtered.reduce((a,b)=>a.indeks > b.indeks ? a : b);
    let worst = filtered.reduce((a,b)=>a.indeks < b.indeks ? a : b);

    document.getElementById("avgIndex").innerText = avg;
    document.getElementById("bestRegion").innerText = best.kabupaten;
    document.getElementById("worstRegion").innerText = worst.kabupaten;

    // Table
    tableBody.innerHTML = "";

    filtered.forEach(item => {
        tableBody.innerHTML += `
            <tr>
                <td>${item.kabupaten}</td>
                <td>${item.indeks}</td>
                <td>${item.aps}</td>
                <td>${item.rls}</td>
                <td>${item.melek}</td>
                <td>${item.cluster}</td>
            </tr>
        `;
    });

    // Chart
    const ctx = document.getElementById("barChart");

    if(chart) chart.destroy();

    chart = new Chart(ctx, {
        type: "bar",
        data: {
            labels: filtered.map(d=>d.kabupaten),
            datasets: [{
                label: "Indeks Pendidikan",
                data: filtered.map(d=>d.indeks)
            }]
        },
        options: {
            responsive: true
        }
    });
}

filter.addEventListener("change", (e)=>{
    renderDashboard(e.target.value);
});

renderDashboard();

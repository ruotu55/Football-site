// Application Security Requirement: load squad JSON only from curated index paths; avoid dynamic URL assembly from untrusted input.
import { appState, clearSlotPhotoIndices, getState } from "./state.js";
import { normalizeTeamPath, projectAssetUrl } from "./paths.js";
import { renderHeader, renderPitch } from "./pitch-render.js";
import { applySavedTeamLayoutAfterLoad, refreshSaveTeamButtonUi } from "./saved-team-layouts.js";

// Specific team mappings to populate standard large tournament selections natively
export const SPECIAL_COMPETITIONS = {
  "Champions League": [
    { name: "Ajax", country: "Netherlands" },
    { name: "Arsenal", country: "England" },
    { name: "Atalanta", country: "Italy" },
    { name: "Athletic Bilbao", country: "Spain" },
    { name: "Atlético", country: "Spain" }, 
    { name: "Barcelona", country: "Spain" },
    { name: "Bayer", country: "Germany" }, 
    { name: "Bayern Munich", country: "Germany" },
    { name: "Benfica", country: "Portugal" },
    { name: "Bodø", country: "Norway" }, 
    { name: "Borussia Dortmund", country: "Germany" },
    { name: "Chelsea", country: "England" },
    { name: "Club Brugge", country: "Belgium" },
    { name: "Copenhagen", country: "Denmark" },
    { name: "Eintracht Frankfurt", country: "Germany" },
    { name: "Galatasaray", country: "Türkiye" },
    { name: "Inter Milan", country: "Italy" },
    { name: "Juventus", country: "Italy" },
    { name: "Kairat", country: "Kazakhstan" },
    { name: "Liverpool", country: "England" },
    { name: "Manchester City", country: "England" },
    { name: "Marseille", country: "France" },
    { name: "Monaco", country: "France" },
    { name: "Napoli", country: "Italy" },
    { name: "Newcastle", country: "England" },
    { name: "Olympiacos", country: "Greece" },
    { name: "Pafos", country: "Cyprus" },
    { name: "Paris Saint-Germain", country: "France" },
    { name: "PSV Eindhoven", country: "Netherlands" },
    { name: "Qaraba", country: "Azerbaijan" }, 
    { name: "Real Madrid", country: "Spain" },
    { name: "Slavia Prague", country: "Czech Republic" },
    { name: "Sporting CP", country: "Portugal" },
    { name: "Tottenham", country: "England" },
    { name: "Union Saint-Gilloise", country: "Belgium" },
    { name: "Villarreal", country: "Spain" }
  ],
  "Europa League": [
    { name: "Aberdeen", country: "Scotland" },
    { name: "Aston Villa", country: "England" },
    { name: "Basel", country: "Switzerland" },
    { name: "Bologna", country: "Italy" },
    { name: "Braga", country: "Portugal" },
    { name: "Brann", country: "Norway" },
    { name: "Celta de Vigo", country: "Spain" }, 
    { name: "Celtic", country: "Scotland" },
    { name: "Red Star Belgrade", country: "Serbia" }, 
    { name: "Dinamo Zagreb", country: "Croatia" },
    { name: "Dynamo Kyiv", country: "Ukraine" },
    { name: "FCSB", country: "Romania" },
    { name: "Fenerbahce", country: "Türkiye" }, 
    { name: "Ferencváros", country: "Hungary" },
    { name: "Feyenoord", country: "Netherlands" },
    { name: "Genk", country: "Belgium" },
    { name: "Go Ahead Eagles", country: "Netherlands" },
    { name: "Lech Poznan", country: "Poland" }, 
    { name: "Lille", country: "France" },
    { name: "Ludogorets", country: "Bulgaria" },
    { name: "Lyon", country: "France" },
    { name: "Maccabi Tel Aviv", country: "Israel" },
    { name: "Malmö", country: "Sweden" },
    { name: "Midtjylland", country: "Denmark" },
    { name: "Nice", country: "France" },
    { name: "Nottingham Forest", country: "England" },
    { name: "Panathinaikos", country: "Greece" },
    { name: "PAOK", country: "Greece" },
    { name: "Porto", country: "Portugal" },
    { name: "Rangers", country: "Scotland" },
    { name: "Real Betis", country: "Spain" },
    { name: "Red Bull Salzburg", country: "Austria" },
    { name: "Roma", country: "Italy" },
    { name: "Freiburg", country: "Germany" },
    { name: "Sturm Graz", country: "Austria" },
    { name: "Utrecht", country: "Netherlands" },
    { name: "Stuttgart", country: "Germany" },
    { name: "Young Boys", country: "Switzerland" }
  ],
  "Conference League": [
    { name: "Aberdeen", country: "Scotland" },
    { name: "AEK Athens", country: "Greece" },
    { name: "AEK Larnaca", country: "Cyprus" },
    { name: "Alkmaar", country: "Netherlands" }, 
    { name: "Häcken", country: "Sweden" }, 
    { name: "Breidablik", country: "Iceland" },
    { name: "Celje", country: "Slovenia" },
    { name: "Crystal Palace", country: "England" },
    { name: "Drita", country: "Kosovo" },
    { name: "Dynamo Kyiv", country: "Ukraine" },
    { name: "Fiorentina", country: "Italy" },
    { name: "Hamrun", country: "Malta" },
    { name: "Jagiellonia", country: "Poland" },
    { name: "Kuopion", country: "Finland" }, 
    { name: "Lausanne", country: "Switzerland" },
    { name: "Lech Poznan", country: "Poland" },
    { name: "Legia", country: "Poland" },
    { name: "Lincoln Red Imps", country: "Gibraltar" },
    { name: "Mainz", country: "Germany" },
    { name: "Noah", country: "Armenia" },
    { name: "Omonia Nicosia", country: "Cyprus" }, 
    { name: "Raków", country: "Poland" },
    { name: "Rapid Vienna", country: "Austria" }, 
    { name: "Rayo Vallecano", country: "Spain" },
    { name: "Rijeka", country: "Croatia" },
    { name: "Samsunspor", country: "Türkiye" },
    { name: "Shakhtar", country: "Ukraine" },
    { name: "Shamrock Rovers", country: "Ireland" }, 
    { name: "Shkendija", country: "North Macedonia" }, 
    { name: "Sigma", country: "Czech Republic" },
    { name: "Slovan Bratislava", country: "Slovakia" },
    { name: "Sparta Prague", country: "Czech Republic" },
    { name: "Strasbourg", country: "France" },
    { name: "Craiova", country: "Romania" },
    { name: "Zrinjski", country: "Bosnia-Herzegovina" } 
  ],
  "World Cup 2026": [
    "Algeria", "Argentina", "Australia", "Austria", "Belgium", "Brazil", "Cabo Verde", "Canada", 
    "Colombia", "Côte d'Ivoire", "Croatia", "Curaçao", "Ecuador", "Egypt", "England", "France", 
    "Germany", "Ghana", "Haiti", "Iran", "Italy", "Japan", "Jordan", "Mexico", "Morocco", 
    "Netherlands", "New Zealand", "Nigeria", "Norway", "Panama", "Paraguay", "Portugal", "Qatar", 
    "Saudi Arabia", "Scotland", "Senegal", "South Africa", "South Korea", "Spain", "Switzerland", 
    "Tunisia", "United States", "Uruguay", "Uzbekistan"
  ],
  "Euro 2024": [
    "Albania", "Austria", "Belgium", "Croatia", "Czech Republic", "Denmark", "England", "France", 
    "Georgia", "Germany", "Hungary", "Italy", "Netherlands", "Poland", "Portugal", "Romania", 
    "Scotland", "Serbia", "Slovakia", "Slovenia", "Spain", "Switzerland", "Turkey", "Ukraine"
  ],
  "Copa America 2024": [
    "Argentina", "Bolivia", "Brazil", "Canada", "Chile", "Colombia", "Costa Rica", "Ecuador", 
    "Jamaica", "Mexico", "Panama", "Paraguay", "Peru", "United States", "Uruguay", "Venezuela"
  ]
};

export async function loadSquadJson(entry) {
  const path = normalizeTeamPath(entry.path);
  const res = await fetch(projectAssetUrl(path));
  if (!res.ok) throw new Error(`Failed to load squad (${res.status})`);
  return res.json();
}

export function filterTeams(query) {
  const q = query.trim().toLowerCase();
  
  // FIX: Force blank results if there is no text in the search
  if (!q) return []; 

  const state = getState();
  const list = state.squadType === "club" ? appState.teamsIndex.clubs : appState.teamsIndex.nationalities;

  let filtered = list.filter((t) => t.name.toLowerCase().includes(q));
  filtered.sort((a, b) => a.name.localeCompare(b.name));
  return filtered.slice(0, 50);
}

export function showResults(items) {
  const { els } = appState;
  els.teamResults.replaceChildren();
  const state = getState();
  items.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "team-pick";
    if (state.selectedEntry && state.selectedEntry.path === item.path) {
      btn.classList.add("team-pick--selected");
    }
    btn.textContent = item.name;
    btn.onclick = async () => {
      try {
        const squad = await loadSquadJson(item);
        state.selectedEntry = item;
        state.currentSquad = squad;
        state.searchText = squad.name || item.name;
        await applySavedTeamLayoutAfterLoad(state, item);

        els.teamSearch.value = state.searchText;
        els.teamSearch.classList.add("team-selected");
        els.teamResults.replaceChildren();

        renderHeader();
        renderPitch();
        refreshSaveTeamButtonUi();
      } catch (e) {
        console.error(e);
        state.currentSquad = null;
        state.headerLogoOverrideRelPath = null;
        state.slotClubCrestOverrideRelPathBySlot = {};
        clearSlotPhotoIndices();
        renderHeader();
        renderPitch();
        refreshSaveTeamButtonUi();
      }
    };
    els.teamResults.appendChild(btn);
  });
}

export function filterLeagues(query) {
  const q = query.trim().toLowerCase();
  
  // FIX: Force blank results if there is no text in the search
  if (!q) return []; 
  
  const state = getState();
  let groups = [];
  
  if (state.squadType === "club") {
    // 1. Add Global Competitions first
    groups.push({
      title: "Global Competitions",
      items: ["Champions League", "Europa League", "Conference League"].map(name => ({ name, type: 'special_club' }))
    });

    // 2. Group standard leagues by country
    const countryMap = {};
    appState.teamsIndex.clubs.forEach(t => {
      const country = t.country || "Other";
      if (t.league) {
        if (!countryMap[country]) countryMap[country] = new Set();
        countryMap[country].add(t.league);
      }
    });

    // 3. Sort countries alphabetically and append
    const sortedCountries = Object.keys(countryMap).sort();
    sortedCountries.forEach(country => {
      groups.push({
        title: country,
        items: Array.from(countryMap[country]).sort().map(name => ({ name, country: country, type: 'league' }))
      });
    });

  } else {
    // 1. Add Global Competitions for National Teams
    groups.push({
      title: "Global Competitions",
      items: ["World Cup 2026", "Euro 2024", "Copa America 2024"].map(name => ({ name, type: 'special_national' }))
    });

    // 2. Group by Regions
    const regions = new Set();
    appState.teamsIndex.nationalities.forEach(t => {
      if (t.region) regions.add(t.region);
    });
    
    groups.push({
      title: "Regions",
      items: Array.from(regions).sort().map(name => ({ name, type: 'region' }))
    });
  }

  // If there's a search query, filter inside the groups
  if (q) {
    groups = groups.map(g => ({
      title: g.title,
      items: g.items.filter(item => item.name.toLowerCase().includes(q) || g.title.toLowerCase().includes(q))
    })).filter(g => g.items.length > 0); // Remove empty groups
  }

  return groups;
}

export function getTeamsByLeagueOrCompetition(leagueObj, squadType) {
  const list = squadType === "club" ? appState.teamsIndex.clubs : appState.teamsIndex.nationalities;
  
  if (leagueObj.type === 'league') {
    return list.filter(t => t.league === leagueObj.name && (t.country || "Other") === leagueObj.country);
  } else if (leagueObj.type === 'region') {
    return list.filter(t => t.region === leagueObj.name);
  } else if (leagueObj.type.startsWith('special')) {
    const targetTeams = SPECIAL_COMPETITIONS[leagueObj.name] || [];
    
    return targetTeams.map(target => {
      if (typeof target === 'string') {
        return list.find(t => t.name.toLowerCase() === target.toLowerCase() || t.name.toLowerCase().includes(target.toLowerCase()));
      }
      return list.find(t => {
        if (t.country !== target.country) return false;
        const dbName = t.name.toLowerCase();
        const qName = target.name.toLowerCase();
        return dbName === qName || dbName.includes(qName);
      });
    }).filter(Boolean);
  }
  return [];
}
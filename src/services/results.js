export function calculateResult(pick, game) {
  if (game.status !== 'complete') return 'pending';
  if (game.home_score === null || game.away_score === null) return 'pending';

  const pickedTeamWon = pick.picked_team === 'home'
    ? game.home_score > game.away_score
    : game.away_score > game.home_score;

  // Ties count as losses in survivor
  return pickedTeamWon ? 'win' : 'loss';
}

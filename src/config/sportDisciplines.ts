import type { SportDiscipline } from '../types'

// Seed taxonomy of Sport Type → Discipline pairs. Source of truth:
// public/sports_type_discipline.csv (kept in sync). Embedded here so the default
// list is available synchronously at first load without a runtime fetch. The list
// is editable in Global Settings once seeded; edits persist to localStorage.
const RAW = `
Acrobatic Arts,Acrobatics
Acrobatic Arts,Artistic Cycling
Acrobatic Arts,Cheerleading
Acrobatic Arts,Dancing
Acrobatic Arts,Figure Skating
Acrobatic Arts,Freerunning
Acrobatic Arts,Parkour
Acrobatic Arts,Pole Sports
Acrobatic Arts,Trampolining
Acrobatic Arts,Tricking
Air Sports,Aerobatics
Air Sports,Air Racing
Air Sports,Gliding
Air Sports,Hang Gliding
Air Sports,Kiteboarding
Air Sports,Parachuting
Air Sports,Paragliding
Air Sports,Ultralight Aviation
Animal Sports,Dog Sports
Animal Sports,Equestrian - Dressage
Animal Sports,Equestrian - Endurance
Animal Sports,Equestrian - Eventing
Animal Sports,Equestrian - Polo
Animal Sports,Equestrian - Reining
Animal Sports,Equestrian - Show Jumping
Animal Sports,Equestrian - Vaulting
Animal Sports,Horse Racing
Athletics,Combined Events
Athletics,Cross Country
Athletics,Jumping
Athletics,Racewalking
Athletics,Running - Long Distance
Athletics,Running - Middle Distance
Athletics,Running - Sprints
Athletics,Throws
Bat & Ball Sports,Baseball
Bat & Ball Sports,Cricket
Bat & Ball Sports,Pesäpallo
Bat & Ball Sports,Rounders
Bat & Ball Sports,Softball
Board Sports,Kite Landboarding
Board Sports,Paddleboarding
Board Sports,Skateboarding
Board Sports,Skysurfing
Board Sports,Snowboarding
Board Sports,Surfing
Board Sports,Wakeboarding
Climbing,Competition Climbing
Climbing,Ice Climbing
Climbing,Mountaineering
Combat Sports,Arm Wrestling
Combat Sports,Grappling
Combat Sports,Mixed
Combat Sports,Striking
Combat Sports,Weapons
Combat Sports,Wrestling - Amateur
Combat Sports,Wrestling - Folk
Cue Sports,Carom Billiards
Cue Sports,Pool
Cue Sports,Snooker
Cycling,BMX Freestyle
Cycling,BMX Racing
Cycling,Cyclo-Cross
Cycling,Mountain Bike
Cycling,Para Cycling
Cycling,Road Cycling
Cycling,Track Cycling
Flying Disc,Disc Dog
Flying Disc,Disc Golf
Flying Disc,Freestyle Disc
Flying Disc,Ultimate Frisbee
Football Codes,American Football
Football Codes,Association Football
Football Codes,Australian Football
Football Codes,Canadian Football
Football Codes,Gaelic Football
Football Codes,Rugby League
Football Codes,Rugby Union
Goal Sports,Basketball
Goal Sports,Canoe Polo
Goal Sports,Handball
Goal Sports,Korfball
Goal Sports,Netball
Goal Sports,Water Polo
Golf,Disc Golf
Golf,Footgolf
Golf,Golf
Gymnastics,Acrobatic Gymnastics
Gymnastics,Aerobic Gymnastics
Gymnastics,Artistic Gymnastics
Gymnastics,Rhythmic Gymnastics
Gymnastics,TeamGym
Gymnastics,Trampolining
Gymnastics,Tumbling
Hockey Sports,Bandy
Hockey Sports,Field Hockey
Hockey Sports,Floorball
Hockey Sports,Ice Hockey
Hockey Sports,Inline Hockey
Hockey Sports,Lacrosse
Hockey Sports,Polo
Hockey Sports,Roller Hockey
Mind Sports,Bridge
Mind Sports,Chess
Mind Sports,Draughts / Checkers
Mind Sports,Esports
Mind Sports,Go
Mind Sports,Mahjong
Motor Sports,Car Racing
Motor Sports,Motorcycle Racing
Motor Sports,Powerboat Racing
Motor Sports,Snowmobile Racing
Multi-Sport / Combined,Adventure Racing
Multi-Sport / Combined,Biathlon
Multi-Sport / Combined,Decathlon
Multi-Sport / Combined,Duathlon
Multi-Sport / Combined,Heptathlon
Multi-Sport / Combined,Modern Pentathlon
Multi-Sport / Combined,Swimrun
Multi-Sport / Combined,Triathlon
Net / Racket Sports,American Handball
Net / Racket Sports,Badminton
Net / Racket Sports,Basque Pelota
Net / Racket Sports,Crossminton
Net / Racket Sports,Fistball
Net / Racket Sports,Padel
Net / Racket Sports,Pickleball
Net / Racket Sports,Racquetball
Net / Racket Sports,Sepak Takraw
Net / Racket Sports,Squash
Net / Racket Sports,Table Tennis
Net / Racket Sports,Tennis
Net / Racket Sports,Volleyball
Obstacle & Parkour Sports,Freerunning
Obstacle & Parkour Sports,Ninja Warrior
Obstacle & Parkour Sports,Obstacle Course Racing
Obstacle & Parkour Sports,Parkour
Orienteering,Canoe Orienteering
Orienteering,Foot Orienteering
Orienteering,Mountain Bike Orienteering
Orienteering,Ski Orienteering
Orienteering,Trail Orienteering
Skating,Ice Skating - Figure
Skating,Ice Skating - Speed
Skating,Roller Skating
Skiing,Alpine Skiing
Skiing,Freestyle Skiing
Skiing,Nordic Combined
Skiing,Nordic Skiing - Cross Country
Skiing,Nordic Skiing - Ski Jumping
Skiing,Ski Mountaineering
Sled Sports,Bobsled
Sled Sports,Luge
Sled Sports,Skeleton
Target / Boules Sports,Bocce
Target / Boules Sports,Boccia
Target / Boules Sports,Boules
Target / Boules Sports,Bowls
Target / Boules Sports,Curling
Target / Boules Sports,Shuffleboard
Target Sports,Archery
Target Sports,Axe Throwing
Target Sports,Crossbow
Target Sports,Darts
Target Sports,Shooting
Water Sports,Artistic Swimming
Water Sports,Canoe Slalom
Water Sports,Canoe Sprint
Water Sports,Diving
Water Sports,Finswimming
Water Sports,Kayak Cross
Water Sports,Open Water Swimming
Water Sports,Rowing
Water Sports,Sailing
Water Sports,Surfing
Water Sports,Swimming
Water Sports,Wakeboarding
Weightlifting & Strength,Powerlifting
Weightlifting & Strength,Strongman
Weightlifting & Strength,Weightlifting
`

export const SPORT_DISCIPLINE_PAIRS: { sport_type: string; discipline: string }[] = RAW
  .split(/\r?\n/)
  .map(l => l.trim())
  .filter(Boolean)
  .filter(l => l.toLowerCase() !== 'sport type,discipline')   // skip any header rows
  .map(l => {
    const idx = l.indexOf(',')
    return { sport_type: l.slice(0, idx).trim(), discipline: l.slice(idx + 1).trim() }
  })
  .filter(p => p.sport_type && p.discipline)

// Fresh copy of the seed list with stable ids (called when no persisted list exists).
export function makeDefaultSportDisciplines(): SportDiscipline[] {
  return SPORT_DISCIPLINE_PAIRS.map(p => ({ id: crypto.randomUUID(), interest_id: null, ...p }))
}

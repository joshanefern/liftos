/* Map LiftOS free-text exercise names onto Strava's JSON-upload
   exercise_type enums (developers.strava.com/docs/uploads — "Supported
   Exercises"). The workout log + muscle map Strava renders from an upload
   is only as good as this mapping, so rules go specific → family-generic,
   and anything unrecognized lands on TOTAL_BODY_GENERIC rather than
   failing the upload.

   Same regex conventions as lib/muscleMap.ts: lowercase input, word
   boundaries, movement rules before muscle-name fallbacks (so "hack squat"
   never matches \bback\b). */

type Rule = [RegExp, string];

const RULES: Rule[] = [
  // Bench dips must outrank the bench-press family — "bench dip" contains
  // \bbench\b and would export as a barbell bench press otherwise.
  [/bench.*dip/, "BENCH_DIP"],

  // ── Bench press family ──
  [/incline.*(dumbbell|db).*(bench|press)|(dumbbell|db).*incline.*(bench|press)/, "INCLINE_DUMBBELL_BENCH_PRESS"],
  [/incline.*(bench|press)/, "INCLINE_BARBELL_BENCH_PRESS"],
  [/decline.*(dumbbell|db).*(bench|press)/, "DECLINE_DUMBBELL_BENCH_PRESS"],
  [/close.?grip.*bench/, "CLOSE_GRIP_BARBELL_BENCH_PRESS"],
  [/(dumbbell|db).*(bench|chest).*press|(bench|chest).*press.*(dumbbell|db)/, "DUMBBELL_BENCH_PRESS"],
  [/machine.*chest.*press|chest.*press.*machine/, "MACHINE_CHEST_PRESS"],
  [/floor.*press/, "FLOOR_BENCH_PRESS"],
  [/\bbench\b/, "BARBELL_BENCH_PRESS"],
  [/chest.*press/, "CHEST_PRESS"],

  // ── Squat / leg-press family ──
  [/bulgarian.*(dumbbell|db)|(dumbbell|db).*bulgarian/, "DUMBBELL_BULGARIAN_SPLIT_SQUATS"],
  [/bulgarian/, "BARBELL_BULGARIAN_SPLIT_SQUAT"],
  [/split.*squat/, "BARBELL_SPLIT_SQUAT"],
  [/hack.*squat/, "MACHINE_HACK_SQUAT"],
  [/front.*squat/, "BARBELL_FRONT_SQUAT"],
  [/goblet/, "GOBLET_SQUAT"],
  [/overhead.*squat/, "OVERHEAD_SQUAT"],
  [/sumo.*squat/, "SUMO_SQUAT"],
  [/pistol/, "PISTOL_SQUAT"],
  [/(air|bodyweight|body.?weight).*squat/, "AIR_SQUAT"],
  [/jump.*squat|squat.*jump/, "BODY_WEIGHT_JUMP_SQUAT"],
  [/smith.*squat/, "SMITH_MACHINE_SQUAT"],
  [/wall.?sit/, "WALL_SIT"],
  [/leg.*press/, "LEG_PRESS"],
  [/(back.*squat|barbell.*squat)/, "BARBELL_BACK_SQUAT"],
  [/\bsquats?\b/, "SQUAT_GENERIC"],
  [/leg.*extension/, "MACHINE_LEG_EXTENSION"],

  // ── Deadlift / hinge family ──
  [/(romanian|\brdls?\b)/, "BARBELL_ROMANIAN_DEADLIFT"],
  [/(stiff|straight).?leg.*dead/, "STRAIGHT_LEG_DEADLIFT"],
  [/sumo.*dead/, "SUMO_DEADLIFT"],
  [/trap.?bar.*dead|hex.?bar/, "TRAP_BAR_DEADLIFT"],
  [/rack.*pull/, "RACK_PULL"],
  [/\bdead.?lifts?\b/, "BARBELL_DEADLIFT"],
  [/good.?morning/, "GOOD_MORNING"],
  [/hip.*thrust/, "BARBELL_HIP_THRUST"],
  [/glute.*bridge/, "GLUTE_BRIDGE"],
  [/glute.*kick.?back|kick.?back.*glute/, "MACHINE_GLUTE_KICKBACK"],
  [/hip.*abduct/, "MACHINE_HIP_ABDUCTION"],
  [/hip.*adduct|adductor/, "MACHINE_HIP_ADDUCTION"],
  [/nordic/, "NORDIC_CURL"],
  [/leg.*curl|hamstring.*curl/, "MACHINE_LEG_CURL_SEATED"],
  [/back.*extension|hyper.?extension/, "BACK_EXTENSION"],
  [/kettlebell.*swing|kb.*swing/, "KETTLEBELL_SWING"],

  // ── Lunges / single-leg ──
  [/walking.*lunge/, "WALKING_LUNGE"],
  [/reverse.*lunge/, "REVERSE_LUNGE"],
  [/(side|lateral).*lunge/, "LATERAL_LUNGE"],
  [/lunge/, "LUNGE_GENERIC"],
  [/step.?ups?\b/, "STEP_UP"],

  // ── Calves ──
  [/seated.*calf/, "SEATED_CALF_RAISE"],
  [/calf|calves/, "STANDING_CALF_RAISE"],

  // ── Pull-up / pulldown family ──
  [/lat.*pull.?down|pull.?down/, "LAT_PULLDOWN"],
  [/chin.?up/, "PULL_UP_GENERIC"],
  [/pull.?up/, "PULL_UP_GENERIC"],
  [/muscle.?up/, "MUSCLE_UP"],
  [/dead.*hang|bar.*hang/, "DEAD_HANG"],

  // ── Row family ──
  [/face.*pull/, "FACE_PULL"],
  [/t.?bar.*row/, "T_BAR_ROW"],
  [/(seated|cable).*row/, "SEATED_CABLE_ROW"],
  [/(dumbbell|db).*row|row.*(dumbbell|db)/, "DUMBBELL_ROW"],
  [/(chest.?supported|seal).*row/, "CHEST_SUPPORTED_ROW"],
  [/machine.*row/, "MACHINE_SEATED_ROW"],
  [/landmine.*row/, "LANDMINE_ROW"],
  [/(bent.?over|barbell).*row/, "BENT_OVER_BARBELL_ROW"],
  [/upright.*row/, "BARBELL_UPRIGHT_ROW"],
  [/pull.?over/, "DUMBBELL_PULLOVER"],
  [/\brows?\b/, "ROW_GENERIC"],

  // ── Overhead press family ──
  [/arnold/, "ARNOLD_PRESS"],
  [/push.*press/, "PUSH_PRESS"],
  [/(dumbbell|db).*(shoulder|overhead).*press|(shoulder|overhead).*press.*(dumbbell|db)/, "OVERHEAD_DUMBBELL_PRESS"],
  [/machine.*shoulder.*press/, "MACHINE_SEATED_SHOULDER_PRESS"],
  [/(military|overhead|\bohp\b).*press|\bohp\b/, "OVERHEAD_BARBELL_PRESS"],
  [/shoulder.*press/, "SHOULDER_PRESS_GENERIC"],
  [/handstand.*push/, "HANDSTAND_PUSH_UP"],

  // ── Delts / traps ──
  [/(lateral|side).*raise/, "LATERAL_RAISE_GENERIC"],
  [/front.*raise/, "FRONT_RAISE"],
  [/rear.*delt.*fly|reverse.*fly/, "DUMBBELL_REAR_DELT_FLY"],
  [/shrug/, "BARBELL_SHRUG"],

  // ── Chest isolation ──
  [/cable.*(crossover|fly)/, "CABLE_CROSSOVER"],
  [/pec.*deck/, "PEC_DECK_BUTTERFLY"],
  [/fl(y|ye)e?s?\b/, "DUMBBELL_CHEST_FLY"],

  // ── Arms ──
  [/hammer.*curl/, "DUMBBELL_HAMMER_CURL"],
  [/preacher.*curl/, "EZ_BAR_PREACHER_CURL"],
  [/concentration.*curl/, "CONCENTRATION_CURL"],
  [/spider.*curl/, "SPIDER_CURL"],
  [/wrist.*curl/, "BARBELL_WRIST_CURL"],
  [/cable.*curl/, "CABLE_CURL"],
  [/(dumbbell|db).*curl/, "STANDING_DUMBBELL_BICEPS_CURL"],
  [/(barbell|ez.?bar).*curl/, "BARBELL_BICEPS_CURL"],
  [/curl/, "CURL_GENERIC"],
  [/skull.*crusher/, "SKULL_CRUSHER"],
  [/(pressdown|push.?down)/, "CABLE_TRICEPS_PUSHDOWN"],
  [/overhead.*(tricep|extension)|tricep.*overhead/, "OVERHEAD_DUMBBELL_TRICEPS_EXTENSION"],
  [/tricep.*extension/, "TRICEPS_EXTENSION_GENERIC"],
  [/bench.*dip/, "BENCH_DIP"],
  [/\bdips?\b/, "TRICEP_DIP"],
  [/kick.?back/, "DUMBBELL_KICKBACK"],

  // ── Push-ups ──
  [/diamond.*push/, "DIAMOND_PUSH_UP"],
  [/decline.*push/, "DECLINE_PUSH_UP"],
  [/incline.*push/, "INCLINE_PUSH_UP"],
  [/pike.*push/, "PUSH_UP_GENERIC"],
  [/push.?up/, "PUSH_UP_GENERIC"],

  // ── Core ──
  [/side.*plank/, "SIDE_PLANK_HOLD"],
  [/planks?\b/, "PLANK_HOLD"],
  [/mountain.*climber/, "MOUNTAIN_CLIMBER"],
  [/russian.*twist/, "RUSSIAN_TWIST"],
  [/ab.*wheel|roll.?out/, "AB_WHEEL_ROLLOUT"],
  [/hanging.*(leg|knee).*raise/, "HANGING_LEG_RAISE"],
  [/leg.*raise/, "LEG_RAISE_GENERIC"],
  [/dead.?bug/, "DEADBUG"],
  [/bird.?dog/, "BIRD_DOG"],
  [/hollow/, "HOLLOW_ROCK"],
  [/superman/, "SUPERMAN"],
  [/v.?ups?\b/, "V_UP"],
  [/sit.?up/, "SIT_UP_GENERIC"],
  [/crunch/, "CRUNCH"],
  [/cable.*wood.?chop|wood.?chop/, "CABLE_WOODCHOP"],
  [/pallof/, "PALLOF_PRESS"],
  [/turkish/, "TURKISH_GET_UP"],

  // ── Carries / conditioning ──
  [/farmer/, "FARMERS_CARRY"],
  [/suitcase.*carry/, "SUITCASE_CARRY"],
  [/carry/, "CARRY_GENERIC"],
  [/sled/, "SLED_PUSH"],
  [/battle.*rope/, "BATTLE_ROPES"],
  [/jump.*rope|skipping/, "JUMP_ROPE"],
  [/jumping.*jack/, "JUMPING_JACKS"],
  [/box.*jump/, "BOX_JUMP"],
  [/burpee/, "BURPEE"],
  [/rowing.*(machine|erg)|\berg\b/, "ROWING_MACHINE"],
  [/ball.*slam|slam.*ball/, "BALL_SLAMS"],
  [/thruster/, "THRUSTERS"],

  // ── Olympic ──
  [/clean.*jerk/, "CLEAN_AND_JERK"],
  [/power.*clean/, "BARBELL_POWER_CLEAN"],
  [/\bcleans?\b/, "CLEAN"],
  [/snatch/, "BARBELL_SNATCH"],
  [/jerk/, "SPLIT_JERK"],

  // ── Muscle-name entries (Josh logs "Biceps", "back", "forearms"…) ──
  [/\bbiceps?\b/, "CURL_GENERIC"],
  [/\btriceps?\b/, "TRICEPS_EXTENSION_GENERIC"],
  [/forearms?/, "DUMBBELL_WRIST_CURL"],
  [/\bchest\b/, "BENCH_PRESS_GENERIC"],
  [/\b(back|lats?)\b/, "ROW_GENERIC"],
  [/shoulders?|delts?/, "SHOULDER_PRESS_GENERIC"],
  [/\btraps?\b/, "SHRUG_GENERIC"],
  [/\b(quads?|legs?)\b/, "SQUAT_GENERIC"],
  [/hamstrings?/, "LEG_CURL_GENERIC"],
  [/glutes?/, "HIP_RAISE_GENERIC"],
  [/\b(abs|core|obliques?)\b/, "CORE_GENERIC"],
  [/cardio|treadmill|running|cycling|bike|elliptical|stair/, "CARDIO_GENERIC"],
];

/** Strava exercise_type for a LiftOS exercise name. Never returns null —
    the upload schema requires a value per set. */
export const stravaExerciseType = (name: string): string => {
  const n = name.toLowerCase();
  for (const [pattern, enumValue] of RULES) {
    if (pattern.test(n)) return enumValue;
  }
  return "TOTAL_BODY_GENERIC";
};

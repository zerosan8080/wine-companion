var TestFixtures = {
  sampleRecord: function () {
    return {
      action: "upsertRecord",
      date: "2026-03-07",
      opened_on: "2026-03-07",
      open_day: 1,
      type: "Red",
      name: "Chateau Margaux 2015",
      vintage: 2015,
      producer: "Chateau Margaux",
      country: "France",
      region: "Bordeaux",
      sub_region: "Margaux",
      location: "Home",
      grape_varieties: [
        { name: "Cabernet Sauvignon", percent: 87 },
        { name: "Merlot", percent: 8 },
      ],
      aroma: ["blackcurrant", "cedar"],
      paired_dishes: {
        main: ["beef tenderloin"],
        appetizer: ["pate"],
        side: ["truffle risotto"],
        dessert: [],
        drink_other: [],
      },
      ratings: {
        color: 5,
        aroma: 5,
        tannin: 4,
        acidity: 4,
        fruit: 5,
      },
      overall_score_5: 4.8,
      overall_grade: "A",
      scene: {
        people: "partner",
        style: "anniversary dinner",
        mood: "celebratory",
      },
      repurchase_intent: "ぜひ",
      tags: ["special", "bordeaux"],
      overall_comment: "Structured and persistent.",
      meta: {
        inferred_fields: [],
        notes: "fixture",
      },
      summary_jp: "力強くエレガントな一本。",
    };
  },
};

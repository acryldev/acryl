# acrylblends 1.5.16

Each packed product opens only its own apps. All products keep their apps in ~/.acryl, and a product opened the app opened last, whichever product had made it: ACRYL ADE, started for the first time beside ACRYL Control Center, opened Control Center's app and wrote its own build over that app's source. An app now records the product that made it (apps.json `product`); an app made before that belongs to the product it is named after, and is marked the first time that product opens it.

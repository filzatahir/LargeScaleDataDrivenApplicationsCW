// server setup
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));


// connection to mongodb
mongoose.connect("mongodb://localhost:27017/carsales")
    .then(() => console.log("✅ MongoDB connected"))
    .catch(err => console.error("❌ MongoDB connection error:", err));


// schema setup for mongodb with correct column names
const carSchema = new mongoose.Schema(
    {
        CarID: String,
        Manufacturer: String,
        Model: String,
        "Engine size": Number,
        Fuel_Type: String,
        Year_of_Manufacturing: Number,
        Mileage: Number,
        Price: Number,
        DealerID: Number,
        services: Array,
        accidents: Array,
        features: Array,
    },
    { collection: "cars" }
);

const Car = mongoose.model("Car", carSchema);


// routes for pages (serve html files)
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/cars-page", (req, res) => {
    res.sendFile(path.join(__dirname, "cars.html"));
});

app.get("/accidents-page", (req, res) => {
    res.sendFile(path.join(__dirname, "accidents.html"));
});

app.get("/services-page", (req, res) => {
    res.sendFile(path.join(__dirname, "services.html"));
});


// api1 - get cars with basic filters + sorting
app.get("/cars", async (req, res) => {
    try {
        let query = {};
        let sortOption = {};

        if (req.query.manufacturer?.trim()) {
            query.Manufacturer = req.query.manufacturer.trim();
        }

        if (req.query.model?.trim()) {
            query.Model = req.query.model.trim();
        }

        if (req.query.minPrice) {
            query.Price = { ...query.Price, $gte: Number(req.query.minPrice) };
        }

        if (req.query.maxPrice) {
            query.Price = { ...query.Price, $lte: Number(req.query.maxPrice) };
        }

        if (req.query.hasAccident === "yes") {
            query.accidents = { $exists: true, $ne: [] };
        }
        if (req.query.hasAccident === "no") {
            query.accidents = { $in: [[], null] };
        }

        if (req.query.hasService === "yes") {
            query.services = { $exists: true, $ne: [] };
        }
        if (req.query.hasService === "no") {
            query.services = { $in: [[], null] };
        }

        // feature filter
        if (req.query.feature) {
            query.features = req.query.feature; // matches exact feature inside array
        }

        // accident severity
        if (req.query.severity) {
            query.accidents = { $elemMatch: { Severity: req.query.severity } };
        }

        // service type filtering
        if (req.query.serviceType) {
            query.services = { $elemMatch: { ServiceType: req.query.serviceType } };
        }

        if (req.query.fuel?.trim()) {
    query.Fuel_Type = req.query.fuel.trim();
}

        if (req.query.sort === "asc") sortOption.Price = 1;
        if (req.query.sort === "desc") sortOption.Price = -1;

        const cars = await Car.find(query).sort(sortOption);
        res.json(cars);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// api2 - flatten accidents WITH FILTERS
app.get("/accidents", async (req, res) => {
    try {
        const {
            manufacturer,
            model,
            minCost,
            maxCost,
            multi,
            sort
        } = req.query;

        // 1 — match cars that have accidents
        let matchCars = {
            accidents: { $exists: true, $ne: [] }
        };

        if (manufacturer) matchCars.Manufacturer = manufacturer;
        if (model) matchCars.Model = model;

        // has multiple accidents?
        if (multi === "yes") matchCars["accidents.1"] = { $exists: true };
        if (multi === "no") matchCars["accidents.1"] = { $exists: false };

        // 2 — fetch cars INCLUDING Manufacturer + Model
        const cars = await Car.find(
            matchCars,
            {
                CarID: 1,
                Manufacturer: 1,
                Model: 1,
                accidents: 1,
                _id: 0
            }
        );

        let rows = [];

        // 3 — flatten all accident records
        for (const car of cars) {
            for (const acc of car.accidents) {
                if (!acc) continue;

                const repairCost = Number(acc.Cost_of_Repair) || 0;

                if (minCost && repairCost < Number(minCost)) continue;
                if (maxCost && repairCost > Number(maxCost)) continue;

                rows.push({
                    AccidentID: acc.accidentID || acc.AccidentID || "",
                    CarID: car.CarID,
                    Manufacturer: car.Manufacturer || "",
                    Model: car.Model || "",
                    Date_of_Accident: acc.Date_of_Accident || "",
                    Severity: acc.Severity || "Unknown",
                    Cost_of_Repair: repairCost,
                    Description: acc.Description || ""
                });
            }
        }

        // 4 — sort
        if (sort === "low-high") {
            rows.sort((a, b) => a.Severity.localeCompare(b.Severity));
        }
        if (sort === "high-low") {
            rows.sort((a, b) => b.Severity.localeCompare(a.Severity));
        }

        res.json(rows);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// api3 - flatten services WITH FILTERS
app.get("/services", async (req, res) => {
    try {
        const {
            manufacturer,
            model,
            type,
            minCost,
            maxCost,
            multi
        } = req.query;

        // STEP 1 — Base match: cars that HAVE services
        let matchCars = { services: { $exists: true, $ne: [] } };

        if (manufacturer) matchCars.Manufacturer = manufacturer;
        if (model) matchCars.Model = model;

        // multiple services per car?
        if (multi === "yes") matchCars["services.1"] = { $exists: true };
        if (multi === "no") matchCars["services.1"] = { $exists: false };

        // STEP 2 — Fetch only needed fields
        const cars = await Car.find(
            matchCars,
            {
                CarID: 1,
                Manufacturer: 1,
                Model: 1,
                services: 1,
                _id: 0
            }
        );

        const rows = [];

        // STEP 3 — Flatten + apply filters
        for (const car of cars) {
            for (const s of car.services) {
                if (!s) continue;

                const cost = Number(s.Cost_of_Service) || 0;

                if (type && s.ServiceType !== type) continue;
                if (minCost && cost < Number(minCost)) continue;
                if (maxCost && cost > Number(maxCost)) continue;

                rows.push({
                    ServiceID: s.serviceID || "",
                    CarID: car.CarID,
                    Manufacturer: car.Manufacturer,
                    Model: car.Model,
                    Date_of_Service: s.Date_of_Service || "",
                    Cost_of_Service: cost,
                    ServiceType: s.ServiceType || ""
                });
            }
        }

        res.json(rows);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});



// filtering

app.get("/cars/advanced", async (req, res) => {
    try {
        const {
            manufacturer,
            model,
            fuel,
            minYear, maxYear,
            minMileage, maxMileage,
            minEngine, maxEngine,
            minPrice, maxPrice,
            hasAccident,
            hasService,
            severity,
            serviceType,
            feature,
            dealerCity,
            dealerName,
            sortField,
            sortDir
        } = req.query;

        const pipeline = [];

        // join dealers collection
        pipeline.push(
            {
                $lookup: {
                    from: "dealers",
                    localField: "DealerID",
                    foreignField: "DealerID",
                    as: "dealer"
                }
            },
            { $unwind: { path: "$dealer", preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    DealerName: "$dealer.DealerName",
                    DealerCity: "$dealer.DealerCity"
                }
            }
        );

        const match = {};
        const num = v => Number(v);

        if (manufacturer?.trim()) match.Manufacturer = manufacturer.trim();
        if (model?.trim()) match.Model = model.trim();
        if (fuel?.trim()) match.Fuel_Type = fuel.trim();

        // ranges
        if (minYear || maxYear) {
            match.Year_of_Manufacturing = {};
            if (minYear) match.Year_of_Manufacturing.$gte = num(minYear);
            if (maxYear) match.Year_of_Manufacturing.$lte = num(maxYear);
        }

        if (minMileage || maxMileage) {
            match.Mileage = {};
            if (minMileage) match.Mileage.$gte = num(minMileage);
            if (maxMileage) match.Mileage.$lte = num(maxMileage);
        }

        if (minEngine || maxEngine) {
            match["Engine size"] = {};
            if (minEngine) match["Engine size"].$gte = num(minEngine);
            if (maxEngine) match["Engine size"].$lte = num(maxEngine);
        }

        if (minPrice || maxPrice) {
            match.Price = {};
            if (minPrice) match.Price.$gte = num(minPrice);
            if (maxPrice) match.Price.$lte = num(maxPrice);
        }

        // accident yes/no
        if (hasAccident === "yes") match.accidents = { $exists: true, $ne: [] };
        if (hasAccident === "no") match.accidents = { $in: [[], null] };

        // service yes/no
        if (hasService === "yes") match.services = { $exists: true, $ne: [] };
        if (hasService === "no") match.services = { $in: [[], null] };

        // severity exact
        if (severity?.trim()) {
            pipeline.push({ $match: match });
            pipeline.push({ $match: { accidents: { $elemMatch: { Severity: severity.trim() } } } });
        }

        // service type
        if (serviceType?.trim()) {
            pipeline.push({ $match: match });
            pipeline.push({ $match: { services: { $elemMatch: { ServiceType: serviceType.trim() } } } });
        }

        // feature filter
        if (feature?.trim()) match.features = feature.trim();

        // dealer filtering
        if (dealerCity?.trim()) match.DealerCity = { $regex: dealerCity.trim(), $options: "i" };
        if (dealerName?.trim()) match.DealerName = { $regex: dealerName.trim(), $options: "i" };

        // apply match if any filters exist
        if (Object.keys(match).length) pipeline.push({ $match: match });

        // sorting
        if (sortField) {
            pipeline.push({ $sort: { [sortField]: sortDir === "desc" ? -1 : 1 } });
        }
        if (req.query.fuel) {
            query.Fuel_Type = req.query.fuel;
        }
        if (req.query.minYear || req.query.maxYear) {
            query.Year_of_Manufacturing = {};
            if (req.query.minYear) query.Year_of_Manufacturing.$gte = Number(req.query.minYear);
            if (req.query.maxYear) query.Year_of_Manufacturing.$lte = Number(req.query.maxYear);
        }

        // final projection
        pipeline.push({
            $project: {
                _id: 0,
                CarID: 1,
                Manufacturer: 1,
                Model: 1,
                "Engine size": 1,
                Fuel_Type: 1,
                Year_of_Manufacturing: 1,
                Mileage: 1,
                Price: 1,
                DealerID: 1,
                DealerName: 1,
                DealerCity: 1,
                services: 1,
                accidents: 1,
                features: 1
            }
        });

        const results = await Car.aggregate(pipeline);
        res.json(results);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// run the server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
# NASA & Space Agency Resources Alignment

This document outlines how the _Space Owner_ project aligns with NASA’s mission engineering principles and educational resources, as well as those provided by the Canadian Space Agency (CSA).

## NASA Disclaimer

NASA does not endorse any non-U.S. Government entity and is not responsible for information contained on non-U.S. Government websites. For non-U.S. Government websites, participants must comply with any data use parameters of that specific website.

## Alignment with NASA Data & Resources

### 1. Systems Engineering Approach

The _Space Owner_ implements the four major mission segments defined in [Design and Develop Science Missions](https://www.nasa.gov/wp-content/uploads/2025/04/250323-design-and-develop-science-mission.pdf):

- **Launch segment**: Represented by the cargo loadout in Act 1: what the ship carries at launch (fuel, life support, power, colony kits) and the mass it has to lift.
- **Space segment**: Represented by the spaceship, its cargo, and the mission environment in Act 2.
- **Ground segment**: The navigation panel and mission-control facilities responsible for communication, trajectory tracking, and mission management.
- **User segment**: The scientists and colonists who apply mission outcomes in Act 3 and the colony ending.

### 2. GMAT-inspired simulation

Our ship simulation (`src/core/simulation/`) implements physical models inspired by the principles of the [General Mission Analysis Tool (GMAT)](https://software.nasa.gov/software/GSC-19468-1), including:

- Numerical orbital propagation (Verlet integration).
- Lambert trajectory solving.
- Rocket equation for fuel/thrust calculations.

### 3. Concept Maturity Levels (CMLs)

The project progression follows the [Concept Maturity Levels (CMLs)](https://dataverse.jpl.nasa.gov/dataset.xhtml?persistentId=hdl:2014/44299) framework, where the game acts as an interactive simulation of these stages:

- **CML 1–4**: The cargo loadout in the warehouse represents the feasibility analysis and trade study phase, where mission architecture (loadout) is evaluated against colony needs.

### 4. Mission Design Lab (MDL)

The game mimics the collaborative design environment of the [Mission Design Lab (MDL)](https://etd.gsfc.nasa.gov/capabilities/integrated-design-center/mission-design-lab/) by simulating key spacecraft disciplines:

- Power (Solar/Battery crates)
- Propulsion (Fuel crates, fuel burn by the rocket equation)
- Thermal (Thermal Kit)
- Communication (Link strength)
- Reliability (Hull breach and other in-flight events)
- Mission Operations (Alarm monitoring)

### 5. NASA Mission Viz & VR Visualization

Like [NASA Mission Viz](https://nasa.github.io/mission-viz/), the navigation panel in Act 2 serves as an interactive, web-based visualization environment, communicating complex orbital dynamics and trajectories through a three-dimensional-inspired projection.

### 6. Telescope Design Simulation

The cargo/loadout system mirrors [A Learning Game About Telescopes](https://science.nasa.gov/mission/webb/game-build-it-yourself/) by requiring players to select scientific objectives (colony needs) and constraining them with compatible engineering hardware (power, life support, fuel, colony kits).

### 7. CubeSat 101

The concepts of ConOps, launch, and operations from [CubeSat 101: Basic Concepts and Processes for First-Time CubeSat Developers](https://www3.nasa.gov/sites/default/files/atoms/files/nasa_csli_cubesat_101_508.pdf) form the operational framework for the game's mission management, from start at the warehouse to the colony landing.

### 8. NASA Space Apps Challenge (VR Mission Visualization)

The game’s focus on mission concept, trajectory, and temporal visualization aligns with the goals of the 2023 NASA Space Apps challenge to make mission complexities more accessible.

## CSA (Canadian Space Agency) Resources

We encourage users to explore the [CSA collection of digital games and activities](https://www.asc-csa.gc.ca/eng/youth-educators/digital-games-and-activities.asp), which provide additional educational perspectives on space science.

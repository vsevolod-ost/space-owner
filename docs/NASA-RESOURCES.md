# NASA & Space Agency Resources Alignment

This document outlines how the *Space Owner* project aligns with NASA’s mission engineering principles and educational resources, as well as those provided by the Canadian Space Agency (CSA).

## NASA Disclaimer

NASA does not endorse any non-U.S. Government entity and is not responsible for information contained on non-U.S. Government websites. For non-U.S. Government websites, participants must comply with any data use parameters of that specific website.

## Alignment with NASA Data & Resources

### 1. Systems Engineering Approach
The *Space Owner* implements the four major mission segments defined in "Design and Develop Science Missions":
- **Launch segment**: Represented by the rocket and launch services in Act 1.
- **Space segment**: Represented by the spaceship, instruments, and the mission environment in Act 2.
- **Ground segment**: The navigation panel and mission-control facilities responsible for communication, trajectory tracking, and mission management.
- **User segment**: The scientists and colonists who apply mission outcomes in Act 3 and the colony ending.

### 2. GMAT (General Mission Analysis Tool) Integration
Our ship simulation (`src/core/simulation/`) implements high-fidelity physical models inspired by GMAT principles, including:
- Numerical orbital propagation (Verlet integration).
- Lambert trajectory solving.
- Rocket equation for fuel/thrust calculations.
- Orbit determination and maneuver planning.

### 3. Concept Maturity Levels (CMLs)
The project progression follows the CML framework, where the game acts as an interactive simulation of these stages:
- **CML 1–4**: The warehouse and ship selection process represents the feasibility analysis and trade study phase, where mission architecture (loadout) is evaluated against colony needs.

### 4. Mission Design Lab (MDL)
The game mimics the collaborative design environment of the MDL by simulating key spacecraft disciplines:
- Power (Solar/Battery crates)
- Propulsion (Fuel/Engine)
- Thermal (Thermal Kit)
- Communication (Link strength)
- Reliability (Hull/Reactor integrity)
- Mission Operations (Alarm monitoring)

### 5. NASA Mission Viz & VR Visualization
The navigation panel in Act 2 serves as an interactive, web-based visualization environment, communicating complex orbital dynamics and trajectories through a three-dimensional-inspired projection.

### 6. Telescope Design Simulation
The cargo/loadout system mirrors the "Learning Game About Telescopes" by requiring players to select scientific objectives (colony needs) and constraining them with compatible engineering hardware (science instruments, power, propulsion).

### 7. CubeSat 101
The guide’s concepts of ConOps, launch, and operations form the operational framework for the game's mission management, from start at the warehouse to the colony landing.

### 8. NASA Space Apps Challenge (VR Mission Visualization)
The game’s focus on mission concept, trajectory, and temporal visualization aligns with the goals of the 2023 NASA Space Apps challenge to make mission complexities more accessible.

## CSA (Canadian Space Agency) Resources
We encourage users to explore the [CSA collection of digital games and activities](https://www.asc-csa.gc.ca/), which provide additional educational perspectives on space science.

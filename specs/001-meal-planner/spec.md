# Feature Specification: Smart Meal Planner with AI-Powered Recommendations

**Feature Branch**: `001-meal-planner`  
**Created**: 2026-02-15  
**Status**: Phases 1 & 2 Complete — Phase 3 (Smart Grocery List) not started  
**Input**: User description: "Build a web application that will help me take stock of my current fridge and pantry inventory which can then be fed through an LLM agent that can recommend meals designed to maximise the use of the current items in fridge and pantry inventory. The app should be able to let the user plan the recommended meals throughout the week through a draggable meal card on a calendar form. The app should also intelligently suggest any missing ingredients yet to be purchased and added to the grocery list for the week. The app should be able to accurately categorise and aggregate the amount needed for each ingredient in the grocery list."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Inventory Tracking and AI Meal Recommendations (Priority: P1)

As a home cook, I want to track what ingredients I have in my fridge and pantry so that I can get personalized meal recommendations that maximize the use of my current inventory and minimize food waste.

**Why this priority**: This is the core value proposition - reducing food waste through intelligent meal planning. Without inventory tracking and AI recommendations, the app provides no unique value. This is the MVP foundation.

**Independent Test**: Can be fully tested by (1) adding inventory items, (2) requesting meal recommendations, and (3) viewing suggested recipes that prioritize existing ingredients. Delivers immediate value by helping users discover what meals they can make with what they already have.

**Acceptance Scenarios**:

1. **Given** I have an empty inventory, **When** I add ingredients (e.g., "chicken breast 2 lbs", "carrots 500g", "rice 1 cup"), **Then** the system saves my inventory with accurate quantities and categories

2. **Given** I have 5+ items in my inventory, **When** I request meal recommendations, **Then** the AI generates 3-5 meal suggestions that primarily use my existing ingredients

3. **Given** I view a recommended meal, **When** I see the ingredient list, **Then** ingredients I already have are clearly marked/highlighted separately from ingredients I need to purchase

4. **Given** my inventory has perishable items nearing expiration, **When** I request recommendations, **Then** the AI prioritizes meals that use soon-to-expire ingredients

6. **Given** I use an ingredient in a planned meal, **When** I view my inventory, **Then** the system updates quantities to reflect the ingredient consumption

7. **Given** I have an ingredient with an expiration date tomorrow (before midnight), **When** I view my inventory, **Then** the item is highlighted in yellow with a visual indicator

8. **Given** I have an ingredient that expired today or earlier (midnight cutoff), **When** I view my inventory, **Then** the item is highlighted in red and interaction is disabled

9. **Given** I have expired items in my inventory, **When** I request meal recommendations, **Then** the LLM agent does not receive expired items as available ingredients

10. **Given** I try to add an expired ingredient to a meal plan, **When** I click on the expired item, **Then** the system prevents the action and displays a message indicating the item is expired

11. **Given** a recommended meal requires an ingredient I have but it is expired, **When** I view the grocery list, **Then** that ingredient appears as a new item to purchase despite being in my inventory

---

### User Story 2 - Weekly Meal Planning with Drag-and-Drop Calendar (Priority: P2)

As a busy parent, I want to organize my meal plans for the week using a visual calendar where I can drag and drop meal cards, so that I can quickly structure my family's weekly meals and feel in control of our schedule.

**Why this priority**: Enhances usability and user engagement but depends on having meal recommendations (P1). Users can still get value from recommendations without calendar planning, making this a valuable but non-essential enhancement for MVP.

**Independent Test**: Can be fully tested by (1) viewing a weekly calendar interface, (2) dragging meal cards to specific days/meal times, (3) viewing the organized meal plan, and (4) editing or removing planned meals. Delivers value by providing visual organization and reducing decision fatigue.

**Acceptance Scenarios**:

1. **Given** I have received meal recommendations, **When** I view the weekly calendar, **Then** I see a 7-day grid with breakfast, lunch, and dinner slots for each day

2. **Given** I have meal recommendation cards displayed, **When** I drag a meal card to a specific day/meal slot, **Then** the meal is assigned to that time slot and the card visually moves to that position

3. **Given** I have a meal planned for Tuesday dinner, **When** I drag it to Friday lunch, **Then** the meal moves to the new slot and any ingredient calculations update accordingly

4. **Given** I have multiple meals planned throughout the week, **When** I view my calendar, **Then** I see all planned meals clearly organized by day and meal type

5. **Given** I have a meal assigned to a slot, **When** I click a remove/delete action, **Then** the meal is removed from the calendar and returns to the available recommendations

6. **Given** I finish planning my week, **When** I view the calendar overview, **Then** I can see which days are fully planned vs. which still need meals

---

### User Story 3 - Smart Grocery List with Ingredient Aggregation (Priority: P3)

As a shopper, I want an automatically generated grocery list that intelligently aggregates the quantities of ingredients I need for my planned meals, so that I can efficiently shop for exactly what I need without over-buying or forgetting items.

**Why this priority**: Completes the end-to-end workflow but is only valuable after users have planned meals (P2). Users can manually create grocery lists without this feature, making it a convenience enhancement rather than core functionality.

**Independent Test**: Can be fully tested by (1) planning multiple meals for the week, (2) viewing the generated grocery list, (3) verifying ingredient aggregation (e.g., 3 recipes needing onions shows "onions 4 total"), and (4) checking off items. Delivers value by automating tedious calculations and reducing shopping errors.

**Acceptance Scenarios**:

1. **Given** I have planned 3 meals that each require onions (1 onion each), **When** I view my grocery list, **Then** I see "Onions: 3 total" aggregated as a single line item

2. **Given** I have planned meals requiring "milk 1 cup", "milk 2 cups", and "milk 500ml", **When** I view my grocery list, **Then** the system converts to a common unit and shows "Milk: 3.5 cups (approximately 840ml)" or similar normalized quantity

3. **Given** I have ingredients in my inventory (e.g., 2 eggs), and my planned meals need 6 eggs total, **When** I view my grocery list, **Then** I see "Eggs: 4 needed (6 required - 2 in inventory)"

4. **Given** I view my grocery list, **When** I look at the categorized sections, **Then** ingredients are grouped by category (Produce, Dairy, Meat, Pantry, etc.) for easier shopping

5. **Given** I am at the store with my grocery list, **When** I tap/check off an item, **Then** it is marked as purchased and visually crossed out or moved to a "completed" section

6. **Given** I have completed my grocery shopping, **When** I confirm purchased items, **Then** the system adds those items to my inventory with the purchased quantities

7. **Given** my grocery list has 15+ items, **When** I view it, **Then** I can filter by category or search for specific items to quickly find what I need

---

### Edge Cases

- **Empty Inventory**: When user requests meal recommendations with an empty or nearly empty inventory, system suggests popular recipes and prompts user to add inventory items
- **Insufficient Ingredients**: When no recipes can be made with current inventory (e.g., only condiments available), system recommends simple recipes requiring minimal additional ingredients
- **Duplicate Ingredients**: When user adds the same ingredient multiple times with different quantities, system prompts to merge or asks which entry to keep
- **Expired Ingredients**: When user has items in inventory past expiration dates, system flags them with red highlighting and excludes them from meal recommendation input to LLM
- **Partially Expired Inventory**: When user has both fresh and expired versions of the same ingredient (e.g., bought milk last week and yesterday), system distinguishes between them and only counts non-expired quantities for recommendations
- **Unit Conversion Ambiguity**: When aggregating ingredients with ambiguous units (e.g., "1 large onion" + "200g onion"), system uses conservative estimates and flags for user review
- **Meal Plan Conflicts**: When user tries to plan the same meal multiple times in one day, system allows but displays a confirmation prompt
- **LLM Service Unavailable**: When AI recommendation service is down or timing out, system displays cached/popular recipes as fallback options
- **Offline Access**: When user has no internet connection, system displays previously cached meal plans and grocery lists with a notice that new recommendations require connectivity
- **Concurrent Editing**: When user edits inventory on one device while viewing meal plans on another, system syncs changes and refreshes recommendations automatically
- **Missing Expiration Dates**: When ingredients lack expiration dates, system shows them as normal (no highlighting) and includes them in recommendations

## Requirements *(mandatory)*

### Functional Requirements

**Inventory Management**:
- **FR-001**: Users MUST be able to add ingredients to their inventory with name, quantity, unit, category, and optional expiration date
- **FR-002**: Users MUST be able to edit or delete inventory items with immediate reflection in meal recommendations
- **FR-003**: System MUST categorize ingredients automatically into standard categories (Produce, Dairy, Meat, Seafood, Grains, Pantry, Condiments, Frozen, Other)
- **FR-004**: Users MUST be able to search and filter their inventory by category, name, or expiration status
- **FR-005**: System MUST track ingredient quantities and update them when ingredients are used in planned meals

**Expiration Tracking and Visual Indicators**:
- **FR-006**: System MUST visually highlight inventory items based on expiration status using midnight cutoff for date calculations:
  - Yellow highlight for items expiring within 1 day (expiration date is tomorrow)
  - Red highlight for items on or past expiration date (today or earlier)
- **FR-007**: System MUST exclude expired ingredients (midnight cutoff) from the inventory count and NOT include them in the LLM agent's input for meal recommendations
- **FR-008**: When an expired ingredient is required for a recommended meal, system MUST add it to the grocery list as a new item to purchase, regardless of the expired quantity in inventory
- **FR-009**: System MUST display a count or badge showing the number of items in each expiration status category (expiring soon, expired) on the inventory overview
- **FR-010**: System MUST disable user interaction with expired items (cannot be added to meal plans manually) while keeping them visible in the inventory list until user manually removes them
- **FR-011**: System MUST keep expired items visible in inventory with red flagging until user manually removes them (no automatic deletion)

**AI-Powered Meal Recommendations**:
- **FR-012**: System MUST integrate with an LLM agent via API to generate meal recommendations based on current inventory (excluding expired items)
- **FR-014**: System MUST generate 3-5 meal suggestions that prioritize using existing inventory items
- **FR-015**: Each meal recommendation MUST include recipe name, description, estimated cooking time, difficulty level, and complete ingredient list
- **FR-016**: System MUST clearly distinguish between ingredients the user has vs. ingredients they need to purchase in each recipe
- **FR-017**: Users MUST be able to regenerate recommendations to get different meal options
- **FR-018**: System MUST prioritize ingredients nearing expiration (yellow highlighted items) in meal recommendations to reduce food waste

**Meal Planning Calendar**:
- **FR-019**: Users MUST be able to view a weekly calendar with configurable meal slots (breakfast, lunch, dinner, snacks)
- **FR-020**: Users MUST be able to drag and drop meal cards onto specific day/meal slots on the calendar
- **FR-021**: Users MUST be able to remove meals from the calendar and return them to the available pool
- **FR-022**: Users MUST be able to rearrange meals by dragging them between different calendar slots
- **FR-023**: System MUST persist meal plans and reload them when users return to the application
- **FR-024**: Users MUST be able to view meal details (full recipe) by clicking on a planned meal card

**Smart Grocery List**:
- **FR-025**: System MUST automatically generate a grocery list based on all planned meals for the week
- **FR-026**: System MUST aggregate quantities of the same ingredient across multiple recipes (e.g., 3 recipes need onions → total onions needed)
- **FR-027**: System MUST subtract existing inventory quantities from grocery list totals, excluding expired items (show net amount needed)
- **FR-028**: System MUST normalize units for aggregation (convert cups to ml, lbs to kg, etc.) and display in user-preferred units
- **FR-029**: System MUST categorize grocery list items by department/category for efficient shopping
- **FR-030**: Users MUST be able to manually add, edit, or remove items from the grocery list
- **FR-031**: Users MUST be able to check off items as purchased during shopping
- **FR-032**: System MUST offer to add purchased items to inventory when user completes grocery shopping

**Data Persistence and Sync**:
- **FR-033**: System MUST persist all user data (inventory, preferences, meal plans, grocery lists) with automatic saving
- **FR-034**: System MUST sync data across devices for the same user account in real-time or near real-time
- **FR-035**: System MUST maintain data integrity when users access the application from multiple devices concurrently

### Constitutional Requirements (MANDATORY)

All features MUST comply with constitutional principles:

**Security & Authentication**:
- **CR-001**: All API endpoints MUST implement OAuth 2.0/OIDC authentication
- **CR-002**: JWT tokens MUST be validated with signature verification
- **CR-003**: HTTPS MUST be enforced for all communications (TLS 1.3 minimum)
- **CR-004**: Security headers MUST be configured (CSP, X-Frame-Options, HSTS)

**Testing Standards**:
- **CR-005**: Tests MUST be written before implementation (TDD)
- **CR-006**: Backend code coverage MUST be ≥80%, frontend ≥70%
- **CR-007**: Integration tests MUST validate API contracts

**Performance Requirements**:
- **CR-008**: API p95 latency MUST be <200ms for synchronous endpoints
- **CR-009**: Frontend Time to Interactive MUST be <3s on 3G networks
- **CR-010**: Responsive design MUST support 320px to 1920px viewports
- **CR-011**: Application MUST be WCAG 2.1 AA compliant

**API-First Architecture**:
- **CR-012**: All backend functionality MUST be exposed via RESTful API endpoints
- **CR-013**: APIs MUST be documented with OpenAPI 3.0 specification
- **CR-014**: API versioning MUST be explicit in URL path (/api/v1/...)
- **CR-015**: Rate limiting MUST be implemented (100 req/min default per client)

**Twelve-Factor App**:
- **CR-016**: Configuration MUST be stored in environment variables
- **CR-017**: Dependencies MUST be explicitly declared with lock files
- **CR-018**: Application processes MUST be stateless
- **CR-019**: Logs MUST be written to stdout/stderr as JSON streams

### Key Entities *(include if feature involves data)*

- **User**: Represents an authenticated user with profile information and settings. Each user has their own isolated inventory, meal plans, and grocery lists.

- **Ingredient**: Represents a food item with name, quantity, unit of measurement, category (Produce, Dairy, etc.), expiration date (optional), and nutritional information (optional). Can exist in user's inventory or as part of a recipe.

- **Recipe**: Represents a meal with name, description, cuisine type, cooking time, difficulty level, servings, list of required ingredients with quantities, and preparation instructions. Generated by LLM or curated from database.

- **InventoryItem**: Links a user to specific ingredients they currently have, tracking quantity, purchase date, expiration date, expiration status (normal/expiring-soon/expired based on midnight cutoff), and storage location (fridge/freezer/pantry). Updated when ingredients are consumed or added. Expired items remain visible until manually removed.

- **MealPlan**: Represents a planned meal assignment with user, recipe, date, meal type (breakfast/lunch/dinner/snack), and status (planned/completed/skipped). Belongs to a weekly calendar.

- **GroceryList**: Collection of items needed for upcoming meal plans, aggregating ingredient requirements across multiple recipes, subtracting current non-expired inventory, and organizing by category. Can include manually added items.

- **GroceryListItem**: Individual item on a grocery list with ingredient reference, quantity needed, category, estimated cost (optional), purchase status (needed/purchased), and notes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can add 10 inventory items in under 3 minutes using the inventory management interface

- **SC-002**: AI meal recommendations are generated within 5 seconds of user request with a success rate of 95%+

- **SC-003**: 80% of recommended meals use at least 60% of ingredients from the user's current non-expired inventory

- **SC-004**: Users can plan a full week of meals (21 meals across 7 days) in under 10 minutes using the drag-and-drop calendar

- **SC-005**: Grocery list ingredient aggregation achieves 100% accuracy for standard unit conversions (cups, tablespoons, ounces, grams, etc.)

- **SC-006**: Users complete their first full workflow (add inventory → get recommendations → plan meals → generate grocery list) within 15 minutes on their first session

- **SC-007**: Application loads and becomes interactive in under 3 seconds on 3G network connections

- **SC-008**: 90% of users successfully plan at least one meal on their first visit without requiring help documentation

- **SC-009**: Food waste reduction: Users report using at least 20% more of their refrigerated ingredients before expiration compared to pre-app usage (measured via user surveys after 4 weeks)

- **SC-010**: System maintains 99.5% uptime for meal recommendation API with graceful degradation to cached recipes during outages

- **SC-011**: Application functions correctly across mobile (320px), tablet (768px), and desktop (1920px) viewports with no layout breaking

- **SC-012**: Users can access previously planned meals and grocery lists within 2 seconds when returning to the application

- **SC-013**: Users can visually identify expiring and expired ingredients at a glance, with 95% of users correctly identifying item status within 2 seconds in usability testing

- **SC-014**: Expired items are correctly excluded from LLM recommendations 100% of the time, ensuring food safety compliance

## Assumptions

The following assumptions have been made to fill gaps in the feature description:

1. **Single User Focus**: MVP targets individual users, not families or shared household accounts. Multi-user sharing will be a future enhancement.

2. **Manual Inventory Entry**: Initial version uses text-based input with autocomplete. Barcode scanning, voice input, and receipt photo parsing are deferred to future versions.

3. **Recipe Scope**: LLM-generated meal recommendations include recipe name, ingredients, and basic instructions. Detailed step-by-step photos and video tutorials are out of scope for MVP.

4. **English Language Only**: MVP launches with English language support. Internationalization (i18n) is deferred.

6. **Ingredient Database**: System uses a curated ingredient database with standard categorizations. User-created custom ingredients are supported but may require manual categorization.

7. **Meal Types**: Default meal slots are Breakfast, Lunch, Dinner. Users can customize to add Snacks or other meal types in settings.

8. **LLM Integration**: Integration with commercial LLM API (OpenAI GPT, Anthropic Claude, or Google Gemini) via standard REST API. Self-hosted LLM options are out of scope.

9. **Expiration Date Logic**: Expiration tracking uses midnight cutoff for date calculations. Items expiring tomorrow are highlighted yellow, items expired today or earlier are highlighted red and excluded from recommendations. Expired items remain visible in inventory until manually removed by user.

10. **Offline Support**: Application requires internet connectivity for meal recommendations. Offline viewing of cached meal plans and grocery lists is supported via PWA service workers.

11. **Unit Preferences**: Users can set preferred measurement system (metric/imperial) in settings. Default is based on browser locale.

12. **Authentication**: Standard email/password authentication with OAuth 2.0/OIDC. Social login (Google, Apple) is a future enhancement.

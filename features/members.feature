Feature: People are added to groups at the role they need

  Adding someone who is already in a group raises their role if it's lower, and never lowers it.

  Scenario: Adding a person to a group
    Given a group "Sailors"
    When "Ann" is added to "Sailors" as a member
    Then adding succeeds
    And "Sailors" lists "Ann" as a member

  Scenario: Adding a member again as a manager promotes them
    Given a group "Sailors"
    And "Ann" is already in "Sailors" as a member
    When "Ann" is added to "Sailors" as a manager
    Then adding succeeds
    And "Sailors" lists "Ann" as a manager

  Scenario: Adding a manager again as a member keeps them a manager
    Given a group "Sailors"
    And "Ann" is already in "Sailors" as a manager
    When "Ann" is added to "Sailors" as a member
    Then adding succeeds
    And "Sailors" lists "Ann" as a manager

Feature: A new group takes members once Google is ready

  Google refuses members for about a minute after it creates a group.

  Scenario: A group just created refuses members
    Given a group "Sailors" was just created
    When "Ann" is added to "Sailors" as a member
    Then adding fails because "Sailors" is not found

  Scenario: A new group accepts members a minute later
    Given a group "Sailors" was just created
    And a minute passes
    When "Ann" is added to "Sailors" as a member
    Then adding succeeds
    And "Sailors" lists "Ann" as a member

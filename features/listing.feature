Feature: Groups and their members are read in full

  Google returns groups and members a page at a time. The fake holds two to a page.

  Scenario: Listing groups that span pages
    Given a group "Sailors"
    And a group "Coaches"
    And a group "Parents"
    When the groups are listed
    Then the list holds "Coaches", "Parents", and "Sailors"

  Scenario: Listing members that span pages
    Given a group "Sailors"
    And "Ann" is already in "Sailors" as a member
    And "Ben" is already in "Sailors" as a member
    And "Cal" is already in "Sailors" as a manager
    When the members of "Sailors" are listed
    Then the list holds "Ann", "Ben", and "Cal"

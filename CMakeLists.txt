cmake_minimum_required(VERSION 3.16)
project(RemSwitcherBridge LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC OFF)
set(CMAKE_AUTORCC OFF)
set(CMAKE_AUTOUIC OFF)

find_package(Qt6 REQUIRED COMPONENTS Core)

add_executable(RiotManagerBridge
    src/bridge_main.cpp
    src/RiotManager.cpp
    src/RiotManager.h
)

target_include_directories(RiotManagerBridge PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/src)
target_link_libraries(RiotManagerBridge PRIVATE Qt6::Core UIAutomationCore Ole32 OleAut32 User32)

set_target_properties(RiotManagerBridge PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin"
)
